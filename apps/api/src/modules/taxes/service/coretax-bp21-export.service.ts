import {
  BuiltCoretaxBp21Document,
  CORETAX_BP21_CURRENT_TEMPLATE_VERSION,
  CORETAX_BP21_TEMPLATES,
  CORETAX_EXPORT_INVALID_ERROR_CODE,
  CoretaxBp21TemplateVersionValue,
  CoretaxExportValidationView,
  CoretaxXmlExport,
  Pph21ReportLine,
  TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
  TAX_REPORT_NOT_FINALIZED_ERROR_CODE,
  TaxReportRecord,
  buildCoretaxBp21Document,
  normalizeNpwp,
} from '@hms/shared-types';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { ClinicianTaxIdentityRepository } from '../repository/clinician-tax-identity.repository';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { CORETAX_BP21_XML_SERIALIZERS } from './coretax-bp21-xml-serializers';

const TAX_REPORT_AUDIT_RESOURCE = 'tax-report';
const EXPORT_FORMAT = 'CORETAX_BP21';

/**
 * The Coretax BP21 bulk-import file for a finalized PPh 21 draft (P27-T08,
 * `docs/post-mvp/decisions.md` D-044): the XML DJP's BP21 v4 converter would
 * produce from the same rows. Checked first so every problem is listed at
 * once, per clinician; the file itself names each clinician's full NPWP or
 * NIK, so a download is audited both as an export and as an identifier
 * unmask. The clinic uploads it in Coretax itself — the product never files.
 */
@Injectable()
export class CoretaxBp21ExportService {
  constructor(
    private readonly taxReportRepository: TaxReportRepository,
    private readonly clinicianTaxIdentityRepository: ClinicianTaxIdentityRepository,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly taxProfileService: TaxProfileService,
    private readonly auditService: AuditService,
  ) {}

  async validateExport(id: string): Promise<CoretaxExportValidationView> {
    const report = await this.findExportableReportOrThrow(id);
    const built = await this.buildDocument(report);
    return {
      reportId: report.id,
      period: report.period,
      template: CORETAX_BP21_TEMPLATES[CORETAX_BP21_CURRENT_TEMPLATE_VERSION],
      isExportable: built.issues.length === 0,
      lineCount: built.document?.lines.length ?? 0,
      skippedCount: built.skippedDoctorIds.length,
      issues: built.issues,
    };
  }

  async exportXml(params: {
    id: string;
    templateVersion?: CoretaxBp21TemplateVersionValue;
    actor: CurrentUser;
  }): Promise<CoretaxXmlExport> {
    const templateVersion = params.templateVersion ?? CORETAX_BP21_CURRENT_TEMPLATE_VERSION;
    const report = await this.findExportableReportOrThrow(params.id);
    const built = await this.buildDocument(report);
    if (built.document === null) {
      throw new UnprocessableEntityException({
        code: CORETAX_EXPORT_INVALID_ERROR_CODE,
        message: `${built.issues.length} problem(s) stop the BP21 file; fix them and export again`,
        details: built.issues,
      });
    }
    const xml = CORETAX_BP21_XML_SERIALIZERS[templateVersion](built.document);
    await this.recordExportAudit({
      report,
      templateVersion,
      doctorIds: built.document.lines.map((line) => line.doctorId),
      actor: params.actor,
    });
    return {
      fileName: `coretax-bp21-${report.period}-${templateVersion.toLowerCase()}.xml`,
      xml,
    };
  }

  private async buildDocument(report: TaxReportRecord): Promise<BuiltCoretaxBp21Document> {
    const doctorIds = (report.lines as Pph21ReportLine[]).map((line) => line.doctorId);
    const [clinicians, taxId, settings] = await Promise.all([
      this.clinicianTaxIdentityRepository.findCoretaxBp21Sources(doctorIds),
      this.clinicProfileService.getTaxId(),
      this.taxProfileService.getTaxSettings(),
    ]);
    return buildCoretaxBp21Document({
      report,
      clinicNpwp: taxId === null ? null : normalizeNpwp(taxId),
      clinicNitku: settings.nitku,
      clinicians,
    });
  }

  /** Only a frozen PPh 21 month becomes a BP21 file: a draft could still change under it. */
  private async findExportableReportOrThrow(id: string): Promise<TaxReportRecord> {
    const report = await this.taxReportRepository.findReportById(id);
    if (!report) {
      throw new NotFoundException('Tax report not found');
    }
    if (report.kind !== 'PPH21_NON_EMPLOYEE') {
      throw new ConflictException({
        code: TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
        message: 'Only a PPh 21 report becomes a Coretax BP21 file',
      });
    }
    if (report.status !== 'FINALIZED') {
      throw new ConflictException({
        code: TAX_REPORT_NOT_FINALIZED_ERROR_CODE,
        message: `Finalize the ${report.period} report before exporting it to Coretax`,
      });
    }
    return report;
  }

  /** Two rows, neither carrying a number: the export itself, and whose identities it revealed. */
  private async recordExportAudit(params: {
    report: TaxReportRecord;
    templateVersion: CoretaxBp21TemplateVersionValue;
    doctorIds: string[];
    actor: CurrentUser;
  }): Promise<void> {
    const { report, actor } = params;
    await this.auditService.record({
      action: 'EXPORT',
      resource: TAX_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      actorUserId: actor.sub,
      metadata: {
        period: report.period,
        kind: report.kind,
        format: EXPORT_FORMAT,
        templateVersion: params.templateVersion,
        lineCount: params.doctorIds.length,
        totals: report.summary.totals,
      },
    });
    await this.auditService.record({
      action: 'DOCTOR_IDENTIFIER_UNMASKED',
      resource: TAX_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      actorUserId: actor.sub,
      metadata: {
        period: report.period,
        kind: report.kind,
        format: EXPORT_FORMAT,
        doctorIds: params.doctorIds,
      },
    });
  }
}
