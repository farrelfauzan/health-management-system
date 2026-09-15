import {
  DOCTOR_AUTHORITY_EXPIRY_THRESHOLD_DAYS,
  DoctorAuthorityExpiryRecord,
} from '@hms/shared-types';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { NotificationService } from '../../notification/service/notification.service';
import { DoctorAuthorityService } from './doctor-authority.service';

const DEFAULT_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AUTHORITY_READ_PERMISSION_KEY = 'doctor.authority.read:any';

function buildDoctorHref(doctorId: string): string {
  return `/admin/doctors/${doctorId}`;
}

/**
 * The reminder sweep for a midwife's delegated authorities (P25-T02,
 * FR-AUTH-05), modelled line for line on `DoctorLicenseExpiryWorker`: an
 * `unref`'d interval on bootstrap, on by default, safe to re-run because each
 * threshold is claimed once through `doctor_authority_expiry_notices`. Every
 * unrevoked, undeleted grant is swept: the government sets each grant's period
 * (PP 28/2024 Pasal 744(8)), so every row has an end date to reach (D-036).
 */
@Injectable()
export class DoctorAuthorityExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DoctorAuthorityExpiryWorker.name);
  private readonly isEnabled: boolean;
  private readonly sweepIntervalMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private isSweeping = false;

  constructor(
    private readonly doctorAuthorityService: DoctorAuthorityService,
    private readonly notificationService: NotificationService,
    configService: ConfigService,
  ) {
    this.isEnabled =
      configService.get<string>('DOCTOR_AUTHORITY_EXPIRY_REMINDERS_ENABLED') !== 'false';
    this.sweepIntervalMs = this.readSweepIntervalMs(configService);
  }

  onApplicationBootstrap(): void {
    if (!this.isEnabled) {
      this.logger.log(
        'Authority expiry reminders disabled (DOCTOR_AUTHORITY_EXPIRY_REMINDERS_ENABLED=false)',
      );
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.sweepOnce();
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
    this.logger.log(`Authority expiry reminders sweeping every ${this.sweepIntervalMs}ms`);
  }

  onApplicationShutdown(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Runs one sweep and returns how many notifications it raised. Thresholds
   * are walked widest first and each is claimed independently, so a row
   * whose 60-day mark passed while the job was down still gets that notice.
   */
  async sweepOnce(): Promise<number> {
    if (this.isSweeping) {
      return 0;
    }
    this.isSweeping = true;
    try {
      let raisedCount = 0;
      for (const thresholdDays of DOCTOR_AUTHORITY_EXPIRY_THRESHOLD_DAYS) {
        const candidates =
          await this.doctorAuthorityService.findAuthoritiesAtThreshold(thresholdDays);
        for (const candidate of candidates) {
          const claimed = await this.doctorAuthorityService.claimExpiryNotice(
            candidate.record.authorityId,
            thresholdDays,
          );
          if (!claimed) {
            continue;
          }
          raisedCount += await this.notifyAdministrators(
            candidate.record,
            candidate.daysUntilExpiry,
          );
        }
      }
      return raisedCount;
    } catch {
      this.logger.error(buildSafeErrorLog('doctor_authority_expiry_sweep_failed'));
      return 0;
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Broadcasts to everyone who can read authorities — the grant that renders
   * the card decides who is told. The href is written here, by the producer,
   * and points at the clinician's detail page where the card lives.
   */
  private async notifyAdministrators(
    record: DoctorAuthorityExpiryRecord,
    daysUntilExpiry: number,
  ): Promise<number> {
    const hasExpired = daysUntilExpiry < 0;
    return this.notificationService.createForUsersWithPermission(AUTHORITY_READ_PERMISSION_KEY, {
      type: hasExpired ? 'DOCTOR_AUTHORITY_EXPIRED' : 'DOCTOR_AUTHORITY_EXPIRING',
      titleKey: hasExpired ? 'doctorAuthorityExpired.title' : 'doctorAuthorityExpiring.title',
      bodyKey: hasExpired ? 'doctorAuthorityExpired.body' : 'doctorAuthorityExpiring.body',
      params: {
        doctorName: record.doctorName,
        kind: record.kind,
        grantKind: record.grantKind,
        grantReference: record.grantReference,
        validUntil: record.validUntil.toISOString().slice(0, 10),
        daysUntilExpiry: String(daysUntilExpiry),
      },
      href: buildDoctorHref(record.doctorId),
    });
  }

  private readSweepIntervalMs(configService: ConfigService): number {
    const rawValue = configService.get<string>('DOCTOR_AUTHORITY_EXPIRY_SWEEP_INTERVAL_MS');
    if (rawValue === undefined || rawValue.trim() === '') {
      return DEFAULT_SWEEP_INTERVAL_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        'Authority expiry configuration error: DOCTOR_AUTHORITY_EXPIRY_SWEEP_INTERVAL_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
