import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  BpjsPcareConfigRecord,
  BpjsPcareConfigView,
  BpjsPcareConnectionTestOutcome,
  BpjsPcareConnectionTestResult,
  UpsertBpjsPcareConfigInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsPcareHttpClient } from '../../../common/bpjs-pcare/bpjs-pcare-http.client';
import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcareConnection } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { BpjsPcareConfigRepository } from '../repository/bpjs-pcare-config.repository';

const BPJS_CONFIG_AUDIT_RESOURCE = 'BpjsPcareConfig';
const TEST_CONNECTION_PATH = 'poli/fktp/0/1';
const SECRET_FIELD_NAMES = ['secretKey', 'userKey', 'pcarePassword'] as const;
const COMPARABLE_FIELD_NAMES = [
  'environment',
  'consId',
  'kdProviderPpk',
  'pcareUsername',
  'isActive',
] as const;

/**
 * Manages the facility's PCare bridging credentials (P11-T02). Secrets are
 * write-only end to end: requests may carry them, views never do, and every
 * create/update/delete/test emits an audit event that names changed fields
 * but never values. The test-connection call reads the harmless poli
 * reference list — it proves signature validity, credential acceptance, and
 * response decryption in one round trip, and reports failure as an outcome
 * rather than an error so the settings screen can render it.
 */
@Injectable()
export class BpjsPcareConfigService {
  constructor(
    private readonly configRepository: BpjsPcareConfigRepository,
    private readonly httpClient: BpjsPcareHttpClient,
    private readonly auditService: AuditService,
  ) {}

  async getConfig(): Promise<BpjsPcareConfigView> {
    const record = await this.requireConfig();
    return this.toView(record);
  }

  async upsertConfig(
    input: UpsertBpjsPcareConfigInput,
    actor: CurrentUser,
  ): Promise<{ view: BpjsPcareConfigView; wasCreated: boolean }> {
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
      action: 'BPJS_CONFIG_DELETED',
      resource: BPJS_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { environment: record.environment },
    });
    return { id: record.id };
  }

  async testConnection(actor: CurrentUser): Promise<BpjsPcareConnectionTestResult> {
    const record = await this.requireConfig();
    const connection = await this.executeCryptoDependentWrite(() =>
      this.configRepository.getConnection(),
    );
    if (connection === null) {
      throw new NotFoundException('BPJS PCare is not configured');
    }
    const outcome = await this.performConnectionTest(connection);
    await this.configRepository.recordConnectionTest(record.id, outcome);
    await this.auditService.record({
      action: 'BPJS_CONNECTION_TESTED',
      resource: BPJS_CONFIG_AUDIT_RESOURCE,
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
    connection: BpjsPcareConnection,
  ): Promise<BpjsPcareConnectionTestOutcome> {
    const testedAt = new Date();
    try {
      await this.httpClient.sendRequest(connection, { method: 'GET', path: TEST_CONNECTION_PATH });
      return {
        isSuccessful: true,
        message: 'Signature accepted and response decrypted (poli reference read)',
        testedAt,
      };
    } catch (caughtError) {
      if (!(caughtError instanceof BpjsPcareError)) {
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
    input: UpsertBpjsPcareConfigInput,
    actor: CurrentUser,
  ): Promise<BpjsPcareConfigView> {
    if (
      input.secretKey === undefined ||
      input.userKey === undefined ||
      input.pcarePassword === undefined
    ) {
      throw new BadRequestException(
        'secretKey, userKey and pcarePassword are required when creating the BPJS PCare configuration',
      );
    }
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.createConfig({
        ...input,
        secretKey: input.secretKey as string,
        userKey: input.userKey as string,
        pcarePassword: input.pcarePassword as string,
      }),
    );
    await this.auditService.record({
      action: 'BPJS_CONFIG_CREATED',
      resource: BPJS_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { environment: input.environment },
    });
    return this.toView(record);
  }

  private async updateConfig(
    existing: BpjsPcareConfigRecord,
    input: UpsertBpjsPcareConfigInput,
    actor: CurrentUser,
  ): Promise<BpjsPcareConfigView> {
    const changedFields = this.collectChangedFields(existing, input);
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.updateConfig(existing.id, input),
    );
    await this.auditService.record({
      action: 'BPJS_CONFIG_UPDATED',
      resource: BPJS_CONFIG_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { changedFields },
    });
    return this.toView(record);
  }

  private collectChangedFields(
    existing: BpjsPcareConfigRecord,
    input: UpsertBpjsPcareConfigInput,
  ): string[] {
    const changedComparableFields = COMPARABLE_FIELD_NAMES.filter(
      (fieldName) => input[fieldName] !== existing[fieldName],
    );
    const rotatedSecretFields = SECRET_FIELD_NAMES.filter(
      (fieldName) => input[fieldName] !== undefined,
    );
    return [...changedComparableFields, ...rotatedSecretFields];
  }

  private async requireConfig(): Promise<BpjsPcareConfigRecord> {
    const record = await this.configRepository.findConfig();
    if (record === null) {
      throw new NotFoundException('BPJS PCare is not configured');
    }
    return record;
  }

  private async executeCryptoDependentWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (caughtError) {
      if (
        caughtError instanceof BpjsPcareError &&
        caughtError.code === 'BPJS_PCARE_NOT_CONFIGURED'
      ) {
        throw new ServiceUnavailableException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private toView(record: BpjsPcareConfigRecord): BpjsPcareConfigView {
    return {
      id: record.id,
      environment: record.environment,
      consId: record.consId,
      kdProviderPpk: record.kdProviderPpk,
      pcareUsername: record.pcareUsername,
      hasSecretKey: true,
      secretKeyLast4: record.secretKeyLast4,
      hasUserKey: true,
      userKeyLast4: record.userKeyLast4,
      hasPcarePassword: true,
      isActive: record.isActive,
      lastTestedAt: record.lastTestedAt === null ? null : record.lastTestedAt.toISOString(),
      lastTestResult: record.lastTestResult,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
