import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  BpjsAntreanConfigRecord,
  BpjsAntreanConfigView,
  BpjsAntreanConnectionTestOutcome,
  BpjsAntreanConnectionTestResult,
  UpsertBpjsAntreanConfigInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanError } from '../../../common/bpjs-antrean/bpjs-antrean.error';
import { BpjsAntreanConnection } from '../../../common/bpjs-antrean/bpjs-antrean.types';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';

const BPJS_ANTREAN_CONFIG_AUDIT_RESOURCE = 'BpjsAntreanConfig';
const TEST_CONNECTION_PATH = 'ref/poli';
const SECRET_FIELD_NAMES = ['secretKey', 'userKey', 'inboundPassword'] as const;
const COMPARABLE_FIELD_NAMES = [
  'environment',
  'consId',
  'kdProviderPpk',
  'inboundUsername',
  'isActive',
] as const;

/**
 * Manages the facility's Antrean Online bridging credentials (P14-T03).
 * Secrets are write-only end to end: requests may carry them, views never do,
 * and every create/update/delete/test emits an audit event that names changed
 * fields but never values.
 *
 * The test-connection call reads the HFIS poli reference — the only
 * side-effect-free endpoint in the Antrean set, and the one that proves
 * signature validity, credential acceptance, and response decryption in one
 * round trip. It reports failure as an outcome rather than an error so the
 * settings screen can render it. Until the `P14-T02` spike runs, a failing
 * test is also the cheapest way to find out that a hypothesis in the adapter
 * (the header set, the codec, the base URLs) was wrong.
 */
@Injectable()
export class BpjsAntreanConfigService {
  constructor(
    private readonly configRepository: BpjsAntreanConfigRepository,
    private readonly httpClient: BpjsAntreanHttpClient,
    private readonly auditService: AuditService,
  ) {}

  async getConfig(): Promise<BpjsAntreanConfigView> {
    const record = await this.requireConfig();
    return this.toView(record);
  }

  async upsertConfig(
    input: UpsertBpjsAntreanConfigInput,
    actor: CurrentUser,
  ): Promise<{ view: BpjsAntreanConfigView; wasCreated: boolean }> {
    const existing = await this.configRepository.findConfig();
    if (existing === null) {
      return { view: await this.createConfig(input, actor), wasCreated: true };
    }
    return { view: await this.updateConfig(existing, input, actor), wasCreated: false };
  }

  async deleteConfig(actor: CurrentUser): Promise<{ id: string }> {
    const record = await this.requireConfig();
    await this.configRepository.deleteConfig(record.id);
    await this.auditService.record({
      action: 'BPJS_ANTREAN_CONFIG_DELETED',
      resource: BPJS_ANTREAN_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { environment: record.environment },
    });
    return { id: record.id };
  }

  async testConnection(actor: CurrentUser): Promise<BpjsAntreanConnectionTestResult> {
    const record = await this.requireConfig();
    const connection = await this.executeCryptoDependentWrite(() =>
      this.configRepository.getConnection(),
    );
    if (connection === null) {
      throw new NotFoundException('BPJS Antrean is not configured');
    }
    const outcome = await this.performConnectionTest(connection);
    await this.configRepository.recordConnectionTest(record.id, outcome);
    await this.auditService.record({
      action: 'BPJS_ANTREAN_CONNECTION_TESTED',
      resource: BPJS_ANTREAN_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { isSuccessful: outcome.isSuccessful },
    });
    return {
      isSuccessful: outcome.isSuccessful,
      message: outcome.message,
      testedAt: outcome.testedAt.toISOString(),
    };
  }

  private async performConnectionTest(
    connection: BpjsAntreanConnection,
  ): Promise<BpjsAntreanConnectionTestOutcome> {
    const testedAt = new Date();
    try {
      await this.httpClient.sendRequest(connection, {
        method: 'GET',
        path: TEST_CONNECTION_PATH,
      });
      return {
        isSuccessful: true,
        message: 'Signature accepted and response decrypted (HFIS poli reference read)',
        testedAt,
      };
    } catch (caughtError) {
      if (!(caughtError instanceof BpjsAntreanError)) {
        throw caughtError;
      }
      return {
        isSuccessful: false,
        message: `${caughtError.code}: ${caughtError.message}`,
        testedAt,
      };
    }
  }

  private async createConfig(
    input: UpsertBpjsAntreanConfigInput,
    actor: CurrentUser,
  ): Promise<BpjsAntreanConfigView> {
    if (input.secretKey === undefined || input.userKey === undefined) {
      throw new BadRequestException(
        'secretKey and userKey are required when creating the BPJS Antrean configuration',
      );
    }
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.createConfig({
        ...input,
        secretKey: input.secretKey as string,
        userKey: input.userKey as string,
      }),
    );
    await this.auditService.record({
      action: 'BPJS_ANTREAN_CONFIG_CREATED',
      resource: BPJS_ANTREAN_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { environment: input.environment },
    });
    return this.toView(record);
  }

  private async updateConfig(
    existing: BpjsAntreanConfigRecord,
    input: UpsertBpjsAntreanConfigInput,
    actor: CurrentUser,
  ): Promise<BpjsAntreanConfigView> {
    const changedFields = this.collectChangedFields(existing, input);
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.updateConfig(existing.id, input),
    );
    await this.auditService.record({
      action: 'BPJS_ANTREAN_CONFIG_UPDATED',
      resource: BPJS_ANTREAN_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { changedFields },
    });
    return this.toView(record);
  }

  private collectChangedFields(
    existing: BpjsAntreanConfigRecord,
    input: UpsertBpjsAntreanConfigInput,
  ): string[] {
    const changedComparableFields = COMPARABLE_FIELD_NAMES.filter(
      (fieldName) => input[fieldName] !== undefined && input[fieldName] !== existing[fieldName],
    );
    const rotatedSecretFields = SECRET_FIELD_NAMES.filter(
      (fieldName) => input[fieldName] !== undefined,
    );
    return [...changedComparableFields, ...rotatedSecretFields];
  }

  private async requireConfig(): Promise<BpjsAntreanConfigRecord> {
    const record = await this.configRepository.findConfig();
    if (record === null) {
      throw new NotFoundException('BPJS Antrean is not configured');
    }
    return record;
  }

  private async executeCryptoDependentWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (caughtError) {
      if (
        caughtError instanceof BpjsAntreanError &&
        caughtError.code === 'BPJS_ANTREAN_NOT_CONFIGURED'
      ) {
        throw new ServiceUnavailableException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private toView(record: BpjsAntreanConfigRecord): BpjsAntreanConfigView {
    return {
      id: record.id,
      environment: record.environment,
      consId: record.consId,
      kdProviderPpk: record.kdProviderPpk,
      hasSecretKey: true,
      secretKeyLast4: record.secretKeyLast4,
      hasUserKey: true,
      userKeyLast4: record.userKeyLast4,
      inboundUsername: record.inboundUsername,
      hasInboundPassword: record.hasInboundPassword,
      isActive: record.isActive,
      lastTestedAt: record.lastTestedAt === null ? null : record.lastTestedAt.toISOString(),
      lastTestResult: record.lastTestResult,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
