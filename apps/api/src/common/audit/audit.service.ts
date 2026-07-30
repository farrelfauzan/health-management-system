import { Injectable, Logger } from '@nestjs/common';

import { AuditRepository } from './audit.repository';
import { RecordAuditEventInput } from './audit.types';
import { buildSafeErrorLog } from '../observability/safe-logging';

/**
 * Persists audit events for sensitive mutations. Recording is best-effort:
 * a failed audit write is logged but never breaks the business operation.
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
}
