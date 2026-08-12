import { Injectable, Logger } from '@nestjs/common';

import { AuditRepository } from './audit.repository';
import { RecordAuditEventInput } from './audit.types';
import { buildSafeErrorLog } from '../observability/safe-logging';

/**
 * Persists audit events. Two postures, deliberately:
 *
 * `record` is best-effort and used by services annotating a business event
 * they have already committed — failing the caller there would roll back a
 * completed operation to preserve a note about it.
 *
 * `recordOrThrow` is used by `AuditInterceptor` for patient-data access (SJ-4),
 * where the record *is* the regulatory obligation. If it cannot be written the
 * request fails and the data does not reach the client.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.auditRepository.createAuditLog(input);
    } catch {
      this.logger.error(
        buildSafeErrorLog('audit_record_failed', {
          action: input.action,
          resource: input.resource,
        }),
      );
    }
  }

  async recordOrThrow(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.auditRepository.createAuditLog(input);
    } catch (err: unknown) {
      this.logger.error(
        buildSafeErrorLog('audit_record_failed_hard', {
          action: input.action,
          resource: input.resource,
        }),
      );
      throw err;
    }
  }
}
