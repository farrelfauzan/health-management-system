import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateSatusehatKycSessionInput,
  SatusehatKycDisabledReasonValue,
  SatusehatKycOperator,
  SatusehatKycSessionView,
  SatusehatKycStatusView,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SatusehatKycClient } from '../../../common/satusehat/satusehat-kyc.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatKycOperatorRepository } from '../repository/satusehat-kyc-operator.repository';

const AUDIT_RESOURCE = 'satusehat-kyc';
const UNAVAILABLE_CODES: readonly string[] = [
  'SATUSEHAT_NOT_CONFIGURED',
  'SATUSEHAT_KYC_DISABLED',
  'SATUSEHAT_CIRCUIT_OPEN',
];

/**
 * "Verifikasi SATUSEHAT" at the front desk (P24-T16, PRD §7.4).
 *
 * Two questions. `getStatus` answers whether this operator can start a
 * verification now and, if not, the one reason — so the button is disabled
 * with an explanation rather than failing on click (FR-KYC-07). `startSession`
 * asks the platform for a validation URL on the operator's behalf
 * (FR-KYC-02) and audits that it happened (FR-KYC-05).
 *
 * What never happens here: the URL and the token are returned once and are
 * not stored, not logged and not placed in the audit row; the operator's NIK
 * travels only inside the encrypted request body. A failed request is
 * audited with the error code alone (FR-KYC-06).
 */
@Injectable()
export class SatusehatKycService {
  constructor(
    private readonly kycClient: SatusehatKycClient,
    private readonly operatorRepository: SatusehatKycOperatorRepository,
    private readonly auditService: AuditService,
  ) {}

  async getStatus(actor: CurrentUser): Promise<SatusehatKycStatusView> {
    const operator = await this.operatorRepository.findOperator(actor.sub);
    const hasOperatorNik = operator?.nik !== null && operator?.nik !== undefined;
    const disabledReason = this.resolveDisabledReason(operator);
    return { isEnabled: disabledReason === null, disabledReason, hasOperatorNik };
  }

  async startSession(
    payload: CreateSatusehatKycSessionInput,
    actor: CurrentUser,
  ): Promise<SatusehatKycSessionView> {
    const operator = await this.operatorRepository.findOperator(actor.sub);
    const disabledReason = this.resolveDisabledReason(operator);
    if (disabledReason !== null || operator === null) {
      throw this.describeDisabled(disabledReason ?? 'OPERATOR_NIK_MISSING');
    }
    try {
      const validation = await this.kycClient.generateValidationUrl({
        name: operator.name ?? '',
        nik: operator.nik ?? '',
      });
      await this.recordStarted(actor, payload, null);
      return { url: validation.url, expiresAt: null };
    } catch (caughtError) {
      const errorCode = caughtError instanceof SatusehatError ? caughtError.code : 'UNKNOWN';
      await this.recordStarted(actor, payload, errorCode);
      throw this.mapFailure(caughtError);
    }
  }

  /** Deployment reasons first (they are the administrator's), then the operator's own. */
  private resolveDisabledReason(
    operator: SatusehatKycOperator | null,
  ): SatusehatKycDisabledReasonValue | null {
    const clientStatus = this.kycClient.getStatus();
    if (!clientStatus.isEnabled && clientStatus.disabledReason !== null) {
      return clientStatus.disabledReason;
    }
    if (operator === null || operator.nik === null) {
      return 'OPERATOR_NIK_MISSING';
    }
    if (operator.name === null || operator.name.trim() === '') {
      return 'OPERATOR_NAME_MISSING';
    }
    return null;
  }

  private describeDisabled(reason: SatusehatKycDisabledReasonValue): Error {
    if (reason === 'OPERATOR_NIK_MISSING' || reason === 'OPERATOR_NAME_MISSING') {
      return new UnprocessableEntityException({
        code: reason,
        message:
          reason === 'OPERATOR_NIK_MISSING'
            ? 'Add your NIK to your account before verifying a patient'
            : 'Your account has no name; ask an administrator to add one',
      });
    }
    return new ServiceUnavailableException({
      code: reason,
      message: 'SATUSEHAT KYC is not available on this deployment',
    });
  }

  private mapFailure(caughtError: unknown): unknown {
    if (!(caughtError instanceof SatusehatError)) {
      return caughtError;
    }
    if (UNAVAILABLE_CODES.includes(caughtError.code)) {
      return new ServiceUnavailableException({
        code: caughtError.code,
        message: 'SATUSEHAT KYC is not available right now',
      });
    }
    if (caughtError.code === 'SATUSEHAT_KYC_REJECTED') {
      // The platform's own words are the only actionable part; the client has
      // already masked any NIK in them.
      return new BadGatewayException({ code: caughtError.code, message: caughtError.message });
    }
    return new BadGatewayException({
      code: caughtError.code,
      message: 'SATUSEHAT KYC is unreachable; try again later',
    });
  }

  /**
   * One row per attempt (FR-KYC-05). Success carries the operator and the
   * patient page it was started from; failure adds the error code and
   * nothing else — no token, no URL, no NIK, no platform text.
   */
  private async recordStarted(
    actor: CurrentUser,
    payload: CreateSatusehatKycSessionInput,
    errorCode: string | null,
  ): Promise<void> {
    await this.auditService.record({
      action: 'SATUSEHAT_KYC_STARTED',
      resource: AUDIT_RESOURCE,
      actorUserId: actor.sub,
      patientId: payload.patientId ?? null,
      metadata: {
        outcome: errorCode === null ? 'STARTED' : 'FAILED',
        ...(errorCode === null ? {} : { errorCode }),
      },
    });
  }
}
