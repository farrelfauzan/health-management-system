import {
  DOCTOR_LICENSE_EXPIRY_THRESHOLD_DAYS,
  DoctorLicenseExpiryRow,
} from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { NotificationService } from '../../notification/service/notification.service';
import { DoctorLicenseExpiryService } from './doctor-license-expiry.service';

const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LICENSE_EXPIRY_DASHBOARD_HREF = '/admin/doctors/licence-expiry';
const DOCTOR_READ_PERMISSION_KEY = 'doctor.license-expiry.read:any';

/**
 * The clinic-side licence reminder sweep (`P16-T19`, FR-E3-34).
 *
 * Follows `DocumentIngestionWorker`'s shape — an interval on
 * `OnApplicationBootstrap`, `unref`'d so it never holds the process open —
 * rather than a scheduler dependency, because this is a single-instance
 * modular monolith and the state that decides whether to notify is already a
 * row in `doctor_license_expiry_notices`.
 *
 * It sweeps every six hours rather than once a day on purpose: the notice
 * table makes a re-run a no-op, so the only thing a longer interval buys is a
 * longer wait before the clinic hears that a SIP lapsed. Recording the fact
 * rather than trusting the schedule is what makes that safe.
 *
 * Unlike the ingestion worker's flag this one defaults **on**. That flag is
 * off by default because ingestion needs a reachable embedding host and would
 * fail every fifteen seconds without one; this job needs only the database,
 * and a compliance reminder that silently never fires unless someone
 * remembers an environment variable is worse than no feature at all.
 */
@Injectable()
export class DoctorLicenseExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DoctorLicenseExpiryWorker.name);
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly doctorLicenseExpiryService: DoctorLicenseExpiryService,
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.isEnabled = configService.get<string>('LICENCE_EXPIRY_REMINDERS_ENABLED') !== 'false';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log('Licence expiry reminders disabled (LICENCE_EXPIRY_REMINDERS_ENABLED=false)');
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Licence expiry reminders sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Runs one sweep and returns how many notifications it raised.
   *
   * Thresholds are walked widest first, and a licence is announced at every
   * threshold it has crossed and not yet been claimed for. That matters for a
   * licence whose 60-day mark passed while the job was down: it still gets
   * its 60-day notice, because the claim is keyed to the threshold rather
   * than to a calendar date the job has to have been running to observe.
   */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      let raisedCount = 0;
      for (const thresholdDays of DOCTOR_LICENSE_EXPIRY_THRESHOLD_DAYS) {
        const candidates =
          await this.doctorLicenseExpiryService.findLicensesAtThreshold(thresholdDays);
        for (const candidate of candidates) {
          const claimed = await this.doctorLicenseExpiryService.claimExpiryNotice(
            candidate.row.licenseId,
            thresholdDays,
          );
          if (!claimed) {
            continue;
          }
          raisedCount += await this.notifyAdministrators(candidate.row);
        }
      }
      return raisedCount;
    } catch {
      this.logger.error(buildSafeErrorLog('licence_expiry_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Broadcasts to everyone who can read the expiry dashboard — the same grant
   * that decides who sees the screen decides who is told. `params` carries
   * the licence type, its number and its date and nothing else: there is no
   * document field to omit here because the row this is built from has none.
   */
  private async notifyAdministrators(row: DoctorLicenseExpiryRow): Promise<number> {
    const hasExpired = row.daysUntilExpiry < 0;
    return this.notificationService.createForUsersWithPermission(DOCTOR_READ_PERMISSION_KEY, {
      type: hasExpired ? 'LICENCE_EXPIRED' : 'LICENCE_EXPIRING',
      titleKey: hasExpired ? 'licenceExpired.title' : 'licenceExpiring.title',
      bodyKey: hasExpired ? 'licenceExpired.body' : 'licenceExpiring.body',
      params: {
        doctorName: row.doctorName,
        licenceType: row.type,
        licenceNumber: row.licenseNumber,
        expiresAt: row.expiresAt,
        daysUntilExpiry: String(row.daysUntilExpiry),
      },
      href: LICENSE_EXPIRY_DASHBOARD_HREF,
    });
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('LICENCE_EXPIRY_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'Licence expiry configuration error: LICENCE_EXPIRY_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
