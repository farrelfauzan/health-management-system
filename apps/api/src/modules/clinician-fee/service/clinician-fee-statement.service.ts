import {
  ClinicianFeeClinicianRecord,
  ClinicianFeeClinicianSummaryView,
  ClinicianFeeEntryView,
  ClinicianFeePeriodSummaryView,
  ClinicianFeePeriodTotalsRecord,
  ClinicianFeeStatementCsvExport,
  ClinicianFeeStatementEntryRecord,
  ClinicianFeeStatementView,
  sumClinicianFeeTotals,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicianFeeEntryRepository } from '../repository/clinician-fee-entry.repository';
import { buildClinicianFeeStatementCsv } from './build-clinician-fee-statement-csv';

const CLINICIAN_FEE_STATEMENT_AUDIT_RESOURCE = 'clinician-fee-statement';

function toEntryView(entry: ClinicianFeeStatementEntryRecord): ClinicianFeeEntryView {
  return { ...entry, occurredAt: entry.occurredAt.toISOString() };
}

function toClinicianSummary(
  totals: ClinicianFeePeriodTotalsRecord,
  clinician: ClinicianFeeClinicianRecord | undefined,
): ClinicianFeeClinicianSummaryView {
  return {
    doctorId: totals.doctorId,
    doctorName: clinician?.fullName ?? totals.doctorId,
    profession: clinician?.profession ?? 'DOCTOR',
    totals: {
      entryCount: totals.entryCount,
      lineAmount: totals.lineAmount,
      grossFee: totals.grossFee,
      clinicShare: totals.clinicShare,
    },
  };
}

/**
 * The monthly jasa medis statements (P27-T06): every clinician's total for a
 * month, and one clinician's entries. A month is the clinic-local calendar
 * month the entry was written in — the payment month for an accrual, the void
 * month for a reversal — so a closed month's statement never changes.
 */
@Injectable()
export class ClinicianFeeStatementService {
  constructor(
    private readonly clinicianFeeEntryRepository: ClinicianFeeEntryRepository,
    private readonly auditService: AuditService,
  ) {}

  async getPeriodSummary(period: string): Promise<ClinicianFeePeriodSummaryView> {
    const totals = await this.clinicianFeeEntryRepository.sumPeriodByClinician(period);
    const clinicians = await this.clinicianFeeEntryRepository.findClinicians(
      totals.map((row) => row.doctorId),
    );
    const clinicianById = new Map(clinicians.map((clinician) => [clinician.id, clinician]));
    const summaries = totals
      .map((row) => toClinicianSummary(row, clinicianById.get(row.doctorId)))
      .sort((left, right) => left.doctorName.localeCompare(right.doctorName));
    return {
      period,
      clinicians: summaries,
      totals: {
        ...sumClinicianFeeTotals(summaries.map((summary) => summary.totals)),
        entryCount: summaries.reduce((sum, summary) => sum + summary.totals.entryCount, 0),
      },
    };
  }

  async getStatement(doctorId: string, period: string): Promise<ClinicianFeeStatementView> {
    const [clinician] = await this.clinicianFeeEntryRepository.findClinicians([doctorId]);
    if (!clinician) {
      throw new NotFoundException('Clinician not found');
    }
    const entries = await this.clinicianFeeEntryRepository.findStatementEntries({
      doctorId,
      period,
    });
    return {
      period,
      doctorId,
      doctorName: clinician.fullName,
      profession: clinician.profession,
      totals: sumClinicianFeeTotals(entries),
      entries: entries.map(toEntryView),
    };
  }

  async exportStatement(
    doctorId: string,
    period: string,
    actor: CurrentUser,
  ): Promise<ClinicianFeeStatementCsvExport> {
    const statement = await this.getStatement(doctorId, period);
    await this.auditService.record({
      action: 'EXPORT',
      resource: CLINICIAN_FEE_STATEMENT_AUDIT_RESOURCE,
      resourceId: doctorId,
      actorUserId: actor.sub,
      metadata: { period, totals: statement.totals },
    });
    return {
      fileName: `jasa-medis-${period}-${doctorId.slice(0, 8)}.csv`,
      csv: buildClinicianFeeStatementCsv(statement),
    };
  }
}
