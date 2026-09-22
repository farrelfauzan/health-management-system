import {
  ANTENATAL_LAB_BLOCK_INDICATORS,
  BirthsDeathsReportResponse,
  KOHORT_BAYI_COLUMNS,
  KOHORT_IBU_COLUMNS,
  KOHORT_KB_COLUMNS,
  KohortRegisterKindValue,
  KohortRegisterResponse,
  KohortRegisterRow,
  MONTHLY_KIA_INDICATORS,
  MaternalReportColumn,
  MaternalReportHeader,
  MaternalReportKindValue,
  MaternalReportMonthRange,
  MonthlyKiaReportResponse,
  buildBirthsDeathsReport,
  buildKohortBayiRows,
  buildKohortIbuRows,
  buildKohortKbRows,
  computeMonthlyKiaIndicators,
  formatMaternalReportMonthLabel,
  groupRegisterRowsByVillage,
  listRegisterVillages,
  resolveMaternalReportMonthRange,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { MaternalReportsRepository } from '../repository/maternal-reports.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MATERNAL_REPORT_AUDIT_RESOURCE = 'maternal-report';

/** What Permenkes 28/2017 Pasal 28(h) asks for and what this clinic can see. */
const BIRTHS_DEATHS_COVERAGE_NOTE =
  'Kematian di luar klinik tidak tercatat: laporan ini hanya memuat kelahiran yang dicatat klinik dan pasien yang meninggal selama dirawat (pemulangan DIED).';

type RegisterLayout = {
  readonly columns: readonly MaternalReportColumn[];
  readonly isProvisional: boolean;
  readonly buildRows: (range: MaternalReportMonthRange) => Promise<KohortRegisterRow[]>;
};

/**
 * The KIA registers and monthly reports a midwife hands the puskesmas
 * (P25-T15, FR-RPT-01..03; layouts under D-040). Every figure is computed
 * from the maternal-care records on request — nothing is stored, because the
 * register is a view of the month as the record stands when it is printed.
 * The month is resolved once in the clinic's timezone and every reader
 * compares against the same two instants.
 */
@Injectable()
export class MaternalReportsService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly maternalReportsRepository: MaternalReportsRepository,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  get timeZone(): string {
    return this.clinicTimeZone;
  }

  async getKohortRegister(params: {
    register: KohortRegisterKindValue;
    month: string;
    villageCode: string | null;
  }): Promise<KohortRegisterResponse> {
    const range = this.resolveRange(params.month);
    const layout = this.resolveLayout(params.register);
    const [header, rows] = await Promise.all([
      this.buildHeader(params.month),
      layout.buildRows(range),
    ]);
    const groups = groupRegisterRowsByVillage(rows, params.villageCode);
    return {
      register: params.register,
      header,
      villageCode: params.villageCode,
      isProvisionalLayout: layout.isProvisional,
      columns: [...layout.columns],
      villages: listRegisterVillages(rows),
      groups,
      totalRows: groups.reduce((total, group) => total + group.rows.length, 0),
    };
  }

  async getMonthlyKiaReport(month: string): Promise<MonthlyKiaReportResponse> {
    const range = this.resolveRange(month);
    const [header, antenatalVisits, deliveries, postnatalVisits, familyPlanning, hb0GivenAt] =
      await Promise.all([
        this.buildHeader(month),
        this.maternalReportsRepository.listAntenatalVisitsInMonth(range),
        this.maternalReportsRepository.listDeliveriesInMonth(range),
        this.maternalReportsRepository.listPostnatalVisitsTouchingMonth(range),
        this.maternalReportsRepository.listFamilyPlanningLiveInMonth(range),
        this.maternalReportsRepository.listHb0GivenInMonth(range),
      ]);
    const source = {
      range,
      antenatalVisits,
      deliveries,
      postnatalVisits,
      familyPlanning,
      hb0GivenAt,
    };
    return {
      header,
      isProvisionalLayout: true,
      indicators: computeMonthlyKiaIndicators(MONTHLY_KIA_INDICATORS, source),
      antenatalLab: computeMonthlyKiaIndicators(ANTENATAL_LAB_BLOCK_INDICATORS, source),
    };
  }

  async getBirthsDeathsReport(month: string): Promise<BirthsDeathsReportResponse> {
    const range = this.resolveRange(month);
    const [header, deliveries, deaths] = await Promise.all([
      this.buildHeader(month),
      this.maternalReportsRepository.listDeliveriesInMonth(range),
      this.maternalReportsRepository.listDeathsInMonth(range),
    ]);
    return {
      header,
      coverageNote: BIRTHS_DEATHS_COVERAGE_NOTE,
      ...buildBirthsDeathsReport({ range, deliveries, deaths }),
    };
  }

  /** Every file download is audited as an export, like the tax and fee reports. */
  async recordExport(params: {
    kind: MaternalReportKindValue;
    month: string;
    villageCode: string | null;
    format: 'CSV' | 'PDF';
    actor: CurrentUser;
  }): Promise<void> {
    await this.auditService.record({
      action: 'EXPORT',
      resource: MATERNAL_REPORT_AUDIT_RESOURCE,
      resourceId: `${params.kind}:${params.month}`,
      actorUserId: params.actor.sub,
      metadata: {
        kind: params.kind,
        month: params.month,
        villageCode: params.villageCode,
        format: params.format,
      },
    });
  }

  private resolveRange(month: string): MaternalReportMonthRange {
    return resolveMaternalReportMonthRange(month, this.clinicTimeZone);
  }

  private resolveLayout(register: KohortRegisterKindValue): RegisterLayout {
    switch (register) {
      case 'kohort-ibu':
        return {
          columns: KOHORT_IBU_COLUMNS,
          isProvisional: false,
          buildRows: async (range) =>
            buildKohortIbuRows(
              await this.maternalReportsRepository.listEpisodesActiveInMonth(range),
              range,
            ),
        };
      case 'kohort-bayi':
        return {
          columns: KOHORT_BAYI_COLUMNS,
          isProvisional: true,
          buildRows: async (range) =>
            buildKohortBayiRows(
              await this.maternalReportsRepository.listNewbornsInNeonatalPeriod(range),
              range,
            ),
        };
      case 'kohort-kb':
        return {
          columns: KOHORT_KB_COLUMNS,
          isProvisional: true,
          buildRows: async (range) =>
            buildKohortKbRows(
              await this.maternalReportsRepository.listFamilyPlanningLiveInMonth(range),
              range,
            ),
        };
    }
  }

  private async buildHeader(month: string): Promise<MaternalReportHeader> {
    const identity = await this.clinicProfileService.getReportingIdentity();
    return {
      clinicName: identity.clinicName,
      puskesmasName: identity.puskesmasName,
      puskesmasCode: identity.puskesmasCode,
      month,
      monthLabel: formatMaternalReportMonthLabel(month),
      generatedAt: new Intl.DateTimeFormat('id-ID', {
        timeZone: this.clinicTimeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date()),
    };
  }
}
