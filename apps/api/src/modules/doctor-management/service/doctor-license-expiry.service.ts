import {
  DOCTOR_LICENSE_EXPIRY_BUCKET_DAYS,
  DoctorLicenseExpiryBucketsView,
  DoctorLicenseExpiryRecord,
  DoctorLicenseExpiryRow,
  getCalendarDateInTimeZone,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DoctorLicenseExpiryRepository } from '../repository/doctor-license-expiry.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The clinic's view of practitioner licence expiry (`P16-T19`, FR-E3-33).
 *
 * This service reads `DoctorLicense` and nothing else. Everything an
 * administrator sees here is a number and a date the clinic already
 * administers, which is what lets the vault stay entirely private: the
 * clinic's obligation to keep practitioners licensed never depends on a
 * doctor choosing to share a scan, and this surface never reveals whether one
 * exists — not even for a document that doctor has shared with the viewer
 * (FR-E3-35).
 */
@Injectable()
export class DoctorLicenseExpiryService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly doctorLicenseExpiryRepository: DoctorLicenseExpiryRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone =
      configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * The dashboard: licences already lapsed plus those lapsing inside the
   * next 90 days, bucketed by urgency. A licence appears in exactly one
   * bucket — the tightest one it qualifies for — so a count read off the
   * screen is a count of licences, not of rows.
   */
  async getExpiryBuckets(): Promise<DoctorLicenseExpiryBucketsView> {
    const today = this.resolveClinicToday();
    const [narrow, medium, wide] = DOCTOR_LICENSE_EXPIRY_BUCKET_DAYS;
    const records = await this.doctorLicenseExpiryRepository.listExpiringLicenses(
      this.addDays(today, wide),
    );
    const buckets: DoctorLicenseExpiryBucketsView = {
      expired: [],
      within30Days: [],
      within60Days: [],
      within90Days: [],
    };
    for (const record of records) {
      const row = this.toExpiryRow(record, today);
      if (row.daysUntilExpiry < 0) {
        buckets.expired.push(row);
      } else if (row.daysUntilExpiry <= narrow) {
        buckets.within30Days.push(row);
      } else if (row.daysUntilExpiry <= medium) {
        buckets.within60Days.push(row);
      } else {
        buckets.within90Days.push(row);
      }
    }
    return buckets;
  }

  /**
   * Lapsed licences for a set of doctors, keyed by doctor id — the lookup
   * `P16-T20` calls across the module boundary, service to service, so the
   * scheduler's warning reads the same expiry semantics as the dashboard.
   */
  async findExpiredLicensesByDoctor(
    doctorIds: string[],
  ): Promise<Map<string, DoctorLicenseExpiryRow[]>> {
    const today = this.resolveClinicToday();
    const records = await this.doctorLicenseExpiryRepository.listExpiredLicensesForDoctors(
      doctorIds,
      today,
    );
    const byDoctor = new Map<string, DoctorLicenseExpiryRow[]>();
    for (const record of records) {
      const rows = byDoctor.get(record.doctorId) ?? [];
      rows.push(this.toExpiryRow(record, today));
      byDoctor.set(record.doctorId, rows);
    }
    return byDoctor;
  }

  /**
   * Every live licence that has reached or passed `thresholdDays` before its
   * expiry, for the reminder job. Returned with the threshold each row
   * crossed so the caller can claim the right notice key.
   */
  async findLicensesAtThreshold(
    thresholdDays: number,
  ): Promise<Array<{ row: DoctorLicenseExpiryRow; thresholdDays: number }>> {
    const today = this.resolveClinicToday();
    const records = await this.doctorLicenseExpiryRepository.listExpiringLicenses(
      this.addDays(today, thresholdDays),
    );
    return records.map((record) => ({
      row: this.toExpiryRow(record, today),
      thresholdDays,
    }));
  }

  /**
   * Whether this licence has not yet been announced at this threshold,
   * claiming it in the same call. The unique index decides, so two workers
   * reaching the same row together produce one notification.
   */
  async claimExpiryNotice(licenseId: string, thresholdDays: number): Promise<boolean> {
    return this.doctorLicenseExpiryRepository.claimExpiryNotice(licenseId, thresholdDays);
  }

  private toExpiryRow(record: DoctorLicenseExpiryRecord, today: Date): DoctorLicenseExpiryRow {
    return {
      licenseId: record.licenseId,
      doctorId: record.doctorId,
      doctorName: record.doctorName,
      type: record.type,
      licenseNumber: record.licenseNumber,
      issuedAt: record.issuedAt === null ? null : this.toDateOnly(record.issuedAt),
      expiresAt: this.toDateOnly(record.expiresAt),
      daysUntilExpiry: Math.round(
        (record.expiresAt.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
      ),
    };
  }

  /**
   * Midnight UTC of the clinic's current calendar day. Licence expiry is a
   * date, not an instant: a SIP expiring "today" is valid all day in Jakarta
   * whatever the server's clock reads, and counting days from the browser's
   * midnight would put the same licence in different buckets for two people
   * looking at the same screen.
   */
  private resolveClinicToday(): Date {
    return new Date(`${getCalendarDateInTimeZone(new Date(), this.clinicTimeZone)}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
