import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CustomerServiceConfig,
  OverdueProspectivePatientRecord,
  ProspectiveExpirySweepResult,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveCustomerServiceConfig } from '../customer-service.config';
import { ProspectivePatientRepository } from '../repository/prospective-patient.repository';

const PROSPECTIVE_AUDIT_RESOURCE = 'ProspectivePatient';

/**
 * Whether the sweep may delete this record (`P17-T06`).
 *
 * A live booking is the one and only reason to leave it. Somebody who booked
 * four months ahead, or rescheduled twice, is past their retention date and
 * has still not arrived *yet* — deleting them would drop the subject of a
 * booking the front desk is expecting to see walk in.
 *
 * Exported so the rule can be argued with in a unit test without a database,
 * and so the worker and the repository's in-transaction re-check are visibly
 * asking the same question.
 */
export function canPurgeOverdueRecord(record: OverdueProspectivePatientRecord): boolean {
  return record.liveAppointments === 0;
}

/**
 * Empties the prospective table on a retention clock (`P17-T06`, design §6).
 *
 * **A prospective patient is not clinical data.** PMK 24/2022's twenty-five
 * year floor does not apply to it and applying it would be the mistake the
 * whole table exists to undo: the row is a booking enquiry holding a name and
 * a phone number for somebody who was never a patient. What governs it is
 * UU PDP 27/2022, and the answer that takes is ninety days —
 * `CS_PROSPECTIVE_PATIENT_RETENTION_DAYS` — after which the clinic has no
 * reason to still be holding a stranger's number.
 *
 * `LINKED` and `CONVERTED` records are **never** swept, at any age. They are
 * the provenance of a real patient's first contact with the clinic, and they
 * are what makes a repeat booking from the same number resolve to the same
 * person instead of opening a second enquiry.
 *
 * Follows the same shape as the SATUSEHAT and BPJS pollers — a plain interval
 * on a single-instance modular monolith, unref'd so it never holds the process
 * open, and skipping rather than queueing an overlapping cycle. It differs in
 * one way: the flag **defaults to on**. Not sweeping is the compliance failure
 * this job exists to prevent, so switching it off is the deliberate act.
 */
@Injectable()
export class ProspectivePatientExpiryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ProspectivePatientExpiryWorker.name);
  private readonly serviceConfig: CustomerServiceConfig;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    configService: ConfigService,
    private readonly prospectivePatientRepository: ProspectivePatientRepository,
    private readonly auditService: AuditService,
  ) {
    this.serviceConfig = resolveCustomerServiceConfig(configService);
  }

  onApplicationBootstrap(): void {
    const { workerEnabled, workerPollIntervalMs } = this.serviceConfig.prospectiveExpiry;
    if (!workerEnabled) {
      this.logger.warn(
        'Prospective patient expiry sweep disabled — unresolved booking enquiries will be kept past their retention date',
      );
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, workerPollIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Prospective patient expiry sweep running every ${workerPollIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Runs one sweep; overlapping sweeps are skipped, never queued.
   *
   * Per record rather than one bulk delete, because each row is a separate
   * decision and the one that matters — is there a live booking on it — has to
   * be re-asked inside the transaction that deletes. A bulk statement would
   * either race a customer booking mid-sweep or need a lock over the whole
   * table to avoid it.
   */
  async sweepOnce(): Promise<ProspectiveExpirySweepResult> {
    if (this.isSweeping) {
      return { purged: 0, skipped: 0 };
    }
    this.isSweeping = true;
    try {
      const now = new Date();
      const overdue = await this.prospectivePatientRepository.findOverdueRecords({
        now,
        limit: this.serviceConfig.prospectiveExpiry.workerBatchLimit,
      });
      const result = await this.purgeEach(overdue, now);
      if (result.purged > 0 || result.skipped > 0) {
        await this.recordSweep(result);
      }
      return result;
    } catch {
      // A failed sweep is a housekeeping miss, not a request failure: the next
      // interval retries, and a row kept one more day is a smaller problem
      // than a background job that takes the process down with it.
      this.logger.error(buildSafeErrorLog('cs_prospective_expiry_sweep_failed'));
      return { purged: 0, skipped: 0 };
    } finally {
      this.isSweeping = false;
    }
  }

  private async purgeEach(
    overdue: OverdueProspectivePatientRecord[],
    now: Date,
  ): Promise<ProspectiveExpirySweepResult> {
    let purged = 0;
    let skipped = 0;
    for (const record of overdue) {
      if (!canPurgeOverdueRecord(record)) {
        skipped += 1;
        continue;
      }
      const wasPurged = await this.prospectivePatientRepository.purgeOverdueRecord({
        prospectivePatientId: record.id,
        now,
      });
      if (wasPurged) {
        purged += 1;
      } else {
        // The repository's in-transaction re-check declined: a booking arrived,
        // or the counter resolved the record, between the read and the write.
        skipped += 1;
      }
    }
    return { purged, skipped };
  }

  /**
   * Counts, and nothing else.
   *
   * No record id, no name, no number — not in the audit row and not in the log
   * line. The rows this job deletes exist because somebody once typed their
   * name and phone number into a chat and never came; an audit trail naming
   * them would outlive the deletion it describes and quietly recreate the list
   * the retention rule just emptied.
   */
  private async recordSweep(result: ProspectiveExpirySweepResult): Promise<void> {
    await this.auditService.record({
      action: 'DELETE',
      resource: PROSPECTIVE_AUDIT_RESOURCE,
      metadata: { purged: result.purged, skipped: result.skipped },
    });
    this.logger.log(
      buildSafeErrorLog('cs_prospective_expiry_sweep', {
        purged: result.purged,
        skipped: result.skipped,
      }),
    );
  }
}
