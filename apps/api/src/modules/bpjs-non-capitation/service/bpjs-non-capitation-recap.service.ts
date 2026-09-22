import {
  MarkNonCapitationLinesInput,
  MaternalReportMonthRange,
  NON_CAPITATION_DOCUMENT_REQUIREMENTS,
  NON_CAPITATION_SERVICE_TYPES,
  NonCapitationMarkItemResult,
  NonCapitationMarkResponse,
  NonCapitationRecapLine,
  NonCapitationRecapResponse,
  NonCapitationRecapSources,
  NonCapitationServiceTypeValue,
  buildNonCapitationRecapLines,
  countDaysBetweenCalendarDates,
  deriveNonCapitationUnits,
  formatMaternalReportMonthLabel,
  getCalendarDateInTimeZone,
  resolveMaternalReportMonthRange,
  resolveNonCapitationFilingDeadline,
  summarizeNonCapitationRecap,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { BpjsNonCapitationRecapRepository } from '../repository/bpjs-non-capitation-recap.repository';
import { BpjsNonCapitationSettingsService } from './bpjs-non-capitation-settings.service';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const RECAP_AUDIT_RESOURCE = 'bpjs-non-capitation-recap';
const CLAIM_AUDIT_RESOURCE = 'bpjs-non-capitation-claim';

const REQUIRED_DOCUMENT_CATEGORIES = [
  ...new Set(
    NON_CAPITATION_SERVICE_TYPES.flatMap(
      (serviceType) => NON_CAPITATION_DOCUMENT_REQUIREMENTS[serviceType],
    ),
  ),
];

function buildLineKey(serviceType: NonCapitationServiceTypeValue, sourceId: string): string {
  return `${serviceType}:${sourceId}`;
}

/**
 * The bidan jejaring's monthly BPJS non-capitation recap for the induk FKTP
 * (P25-T16, SJ-239), re-scoped by the P25-T13 spike: a file the induk attaches
 * to its rekapitulasi pelayanan, nothing sent to BPJS. Lines are derived on
 * request from the encounters, births and KB records of BPJS participants;
 * only the "sent to the induk" mark is stored.
 */
@Injectable()
export class BpjsNonCapitationRecapService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly recapRepository: BpjsNonCapitationRecapRepository,
    private readonly settingsService: BpjsNonCapitationSettingsService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  get timeZone(): string {
    return this.clinicTimeZone;
  }

  async getRecap(month: string, now: Date = new Date()): Promise<NonCapitationRecapResponse> {
    const range = resolveMaternalReportMonthRange(month, this.clinicTimeZone);
    const [settings, identity, sources] = await Promise.all([
      this.settingsService.getSettings(),
      this.clinicProfileService.getReportingIdentity(),
      this.loadSources(range),
    ]);
    const today = getCalendarDateInTimeZone(now, this.clinicTimeZone);
    const filingDeadline = resolveNonCapitationFilingDeadline(month, settings.filingDayOfMonth);
    const lines = buildNonCapitationRecapLines(sources, {
      timeZone: this.clinicTimeZone,
      today,
      filingDeadline,
    });
    return {
      month,
      monthLabel: formatMaternalReportMonthLabel(month),
      clinicName: identity.clinicName,
      generatedAt: this.formatGeneratedAt(now),
      settings,
      filingDeadline,
      daysUntilFilingDeadline: countDaysBetweenCalendarDates(today, filingDeadline),
      lines,
      ...summarizeNonCapitationRecap({
        lines,
        isNetworkParentGovernmentOwned: settings.isNetworkParentGovernmentOwned,
      }),
    };
  }

  /**
   * Marks lines of the month's recap as handed to the induk. Each item is
   * answered on its own: `NOT_IN_RECAP` for a source that is not a line of
   * that month, `ALREADY_MARKED` for one marked before, `MARKED` otherwise.
   * Only newly marked lines are audited, so a repeated request is a no-op.
   */
  async markLines(
    input: MarkNonCapitationLinesInput,
    actor: CurrentUser,
  ): Promise<NonCapitationMarkResponse> {
    const recap = await this.getRecap(input.month);
    const linesByKey = new Map(
      recap.lines.map((line) => [buildLineKey(line.serviceType, line.sourceId), line]),
    );
    const requested = [
      ...new Map(
        input.items.map((item) => [buildLineKey(item.serviceType, item.sourceId), item]),
      ).values(),
    ];
    const created = await this.recapRepository.createMarks({
      items: requested.filter((item) =>
        linesByKey.has(buildLineKey(item.serviceType, item.sourceId)),
      ),
      claimMonth: `${input.month}-01`,
      markedById: actor.sub,
    });
    const createdKeys = new Set(
      created.map((item) => buildLineKey(item.serviceType, item.sourceId)),
    );
    await this.auditMarks({ month: input.month, created, linesByKey, actor });
    return {
      month: input.month,
      markedCount: created.length,
      results: requested.map((item): NonCapitationMarkItemResult => {
        const key = buildLineKey(item.serviceType, item.sourceId);
        const outcome = !linesByKey.has(key)
          ? 'NOT_IN_RECAP'
          : createdKeys.has(key)
            ? 'MARKED'
            : 'ALREADY_MARKED';
        return { serviceType: item.serviceType, sourceId: item.sourceId, outcome };
      }),
    };
  }

  /** Every CSV or PDF download is audited as an export. */
  async recordExport(params: {
    readonly month: string;
    readonly format: 'CSV' | 'PDF';
    readonly lineCount: number;
    readonly actor: CurrentUser;
  }): Promise<void> {
    await this.auditService.record({
      action: 'EXPORT',
      resource: RECAP_AUDIT_RESOURCE,
      resourceId: params.month,
      actorUserId: params.actor.sub,
      metadata: { month: params.month, format: params.format, lineCount: params.lineCount },
    });
  }

  private async auditMarks(params: {
    readonly month: string;
    readonly created: readonly { serviceType: NonCapitationServiceTypeValue; sourceId: string }[];
    readonly linesByKey: ReadonlyMap<string, NonCapitationRecapLine>;
    readonly actor: CurrentUser;
  }): Promise<void> {
    for (const item of params.created) {
      const line = params.linesByKey.get(buildLineKey(item.serviceType, item.sourceId));
      await this.auditService.record({
        action: 'NON_CAPITATION_CLAIM_MARKED',
        resource: CLAIM_AUDIT_RESOURCE,
        resourceId: buildLineKey(item.serviceType, item.sourceId),
        actorUserId: params.actor.sub,
        patientId: line?.patientId ?? null,
        metadata: { month: params.month, serviceType: item.serviceType, sourceId: item.sourceId },
      });
    }
  }

  private async loadSources(range: MaternalReportMonthRange): Promise<NonCapitationRecapSources> {
    const [antenatal, postnatal, deliveries, familyPlanning, tariffs] = await Promise.all([
      this.recapRepository.listAntenatalVisits(range),
      this.recapRepository.listPostnatalVisits(range),
      this.recapRepository.listDeliveries(range),
      this.recapRepository.listFamilyPlanningActs(range),
      this.settingsService.listTariffSources(),
    ]);
    const units = deriveNonCapitationUnits(
      { antenatal, postnatal, deliveries, familyPlanning },
      this.clinicTimeZone,
    );
    const [documents, marks] = await Promise.all([
      this.recapRepository.listDocuments({
        patientIds: [...new Set(units.flatMap((unit) => unit.documentPatientIds))],
        categories: REQUIRED_DOCUMENT_CATEGORIES,
      }),
      this.recapRepository.listMarks([...new Set(units.map((unit) => unit.sourceId))]),
    ]);
    return { antenatal, postnatal, deliveries, familyPlanning, documents, tariffs, marks };
  }

  private formatGeneratedAt(now: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: this.clinicTimeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(now);
  }
}
