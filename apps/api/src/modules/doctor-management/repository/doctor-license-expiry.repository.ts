import { DoctorLicenseExpiryRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Persistence for the licence expiry dashboard and its reminder job
 * (`P16-T19`).
 *
 * Its own class rather than more methods on `DoctorManagementRepository`
 * because it answers to its own permission and, more importantly, because
 * every query here reads `doctor_licenses` and nothing else. The one thing
 * this repository must never learn how to do is join to `documents` — the
 * clinic's compliance view is built from the structured credential precisely
 * so it cannot depend on, or disclose, whether a doctor uploaded a scan
 * (FR-E3-35). Keeping the queries in a file with no document import is the
 * cheapest way to keep that true as the file grows.
 */
@Injectable()
export class DoctorLicenseExpiryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every live licence carrying an expiry on or before `throughDate`,
   * soonest first.
   *
   * Rows without an `expiresAt` are excluded rather than sorted last: a
   * lifetime STR has no expiry to reach, and treating "never expires" as
   * "expired long ago" is how a compliance list fills with noise nobody
   * reads. Soft-deleted licences and inactive doctors are out for the same
   * reason — the list is of obligations the clinic still has.
   */
  async listExpiringLicenses(throughDate: Date): Promise<DoctorLicenseExpiryRecord[]> {
    const rows = await this.prisma.doctorLicense.findMany({
      where: {
        deletedAt: null,
        expiresAt: { not: null, lte: throughDate },
        doctor: { deletedAt: null, isActive: true },
      },
      select: {
        id: true,
        doctorId: true,
        type: true,
        licenseNumber: true,
        issuedAt: true,
        expiresAt: true,
        doctor: { select: { fullName: true } },
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      licenseId: row.id,
      doctorId: row.doctorId,
      doctorName: row.doctor.fullName,
      type: row.type,
      licenseNumber: row.licenseNumber,
      issuedAt: row.issuedAt,
      // Narrowing what the `not: null` predicate already guarantees; Prisma's
      // generated type cannot express it.
      expiresAt: row.expiresAt as Date,
    }));
  }

  /**
   * Live licences of `doctorId` that have already lapsed, for the scheduling
   * warning (`P16-T20`).
   */
  async listExpiredLicensesForDoctors(
    doctorIds: string[],
    asOf: Date,
  ): Promise<DoctorLicenseExpiryRecord[]> {
    if (doctorIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.doctorLicense.findMany({
      where: {
        doctorId: { in: doctorIds },
        deletedAt: null,
        expiresAt: { not: null, lt: asOf },
      },
      select: {
        id: true,
        doctorId: true,
        type: true,
        licenseNumber: true,
        issuedAt: true,
        expiresAt: true,
        doctor: { select: { fullName: true } },
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      licenseId: row.id,
      doctorId: row.doctorId,
      doctorName: row.doctor.fullName,
      type: row.type,
      licenseNumber: row.licenseNumber,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt as Date,
    }));
  }

  /**
   * Records that this licence has been announced at this threshold.
   *
   * `createMany` with `skipDuplicates` rather than a create: two workers
   * reaching the same row together must produce one notice and no error, and
   * the unique index — not a preceding read — is what actually decides that.
   * Returns whether this call was the one that inserted, so the caller
   * notifies exactly once.
   */
  async claimExpiryNotice(licenseId: string, thresholdDays: number): Promise<boolean> {
    const result = await this.prisma.doctorLicenseExpiryNotice.createMany({
      data: [{ licenseId, thresholdDays }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }
}
