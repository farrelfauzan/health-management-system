import {
  BuiltCoretaxFakturDocument,
  CORETAX_FAKTUR_CURRENT_TEMPLATE_VERSION,
  CORETAX_FAKTUR_EXPORT_INVALID_ERROR_CODE,
  CORETAX_FAKTUR_TEMPLATES,
  CoretaxFakturTemplateVersionValue,
  CoretaxFakturValidationView,
  CoretaxFakturXmlExport,
  PpnOutputReportLine,
  TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
  TAX_REPORT_NOT_FINALIZED_ERROR_CODE,
  TaxReportRecord,
  buildCoretaxFakturDocument,
  normalizeNpwp,
} from '@hms/shared-types';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { CoretaxFakturSourceRepository } from '../repository/coretax-faktur-source.repository';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { CORETAX_FAKTUR_XML_SERIALIZERS } from './coretax-faktur-xml-serializers';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const TAX_REPORT_AUDIT_RESOURCE = 'tax-report';
const EXPORT_FORMAT = 'CORETAX_FAKTUR_KELUARAN';

/**
 * The Coretax Faktur Keluaran bulk-import file for a finalized PPN keluaran
 * draft (P27-T09): the XML DJP's converter v1.6 writes, one faktur per
 * invoice and faktur code, with the patient as buyer by NIK. Checked first
 * so every problem is listed at once, per invoice. The file names each
 * patient's NIK, so a download is audited as an export and as a patient
 * identifier unmask. The clinic uploads it in Coretax — the product never
 * files.
 */
@Injectable()
export class CoretaxFakturExportService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxReportRepository: TaxReportRepository,
    private readonly coretaxFakturSourceRepository: CoretaxFakturSourceRepository,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly taxProfileService: TaxProfileService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async validateExport(id: string): Promise<CoretaxFakturValidationView> {
    const report = await this.findExportableReportOrThrow(id);
    const built = await this.buildDocument(report);
    return {
      reportId: report.id,
      period: report.period,
      template: CORETAX_FAKTUR_TEMPLATES[CORETAX_FAKTUR_CURRENT_TEMPLATE_VERSION],
      isExportable: built.issues.length === 0,
      fakturCount: built.document?.taxInvoices.length ?? 0,
      digunggungCount: built.digunggungInvoiceIds.length,
      issues: built.issues,
    };
  }

  async exportXml(params: {
    id: string;
    templateVersion?: CoretaxFakturTemplateVersionValue;
    actor: CurrentUser;
  }): Promise<CoretaxFakturXmlExport> {
    const templateVersion = params.templateVersion ?? CORETAX_FAKTUR_CURRENT_TEMPLATE_VERSION;
    const report = await this.findExportableReportOrThrow(params.id);
    const built = await this.buildDocument(report);
    if (built.document === null) {
      throw new UnprocessableEntityException({
        code: CORETAX_FAKTUR_EXPORT_INVALID_ERROR_CODE,
        message: `${built.issues.length} problem(s) stop the faktur file; fix them and export again`,
        errors: built.issues,
      });
    }
    const xml = CORETAX_FAKTUR_XML_SERIALIZERS[templateVersion](built.document);
    await this.recordExportAudit({
      report,
      templateVersion,
      invoiceIds: [...new Set(built.document.taxInvoices.map((faktur) => faktur.invoiceId))],
      fakturCount: built.document.taxInvoices.length,
      actor: params.actor,
    });
    return {
      fileName: `coretax-faktur-keluaran-${report.period}-${templateVersion.toLowerCase()}.xml`,
      xml,
    };
  }

  private async buildDocument(report: TaxReportRecord): Promise<BuiltCoretaxFakturDocument> {
    const invoiceIds = [
      ...new Set((report.lines as PpnOutputReportLine[]).map((line) => line.invoiceId)),
    ];
    const [invoices, taxId, settings] = await Promise.all([
      this.coretaxFakturSourceRepository.findInvoices(invoiceIds),
      this.clinicProfileService.getTaxId(),
      this.taxProfileService.getTaxSettings(),
    ]);
    return buildCoretaxFakturDocument({
      invoices,
      clinicNpwp: taxId === null ? null : normalizeNpwp(taxId),
      clinicNitku: settings.nitku,
      timeZone: this.clinicTimeZone,
    });
  }

  /** Only a frozen PPN month becomes a faktur file: a draft could still change under it. */
  private async findExportableReportOrThrow(id: string): Promise<TaxReportRecord> {
    const report = await this.taxReportRepository.findReportById(id);
    if (!report) {
      throw new NotFoundException('Tax report not found');
    }
    if (report.kind !== 'PPN_OUTPUT') {
      throw new ConflictException({
        code: TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
        message: 'Only a PPN keluaran report becomes a Coretax faktur file',
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

  /** Two rows, neither carrying a NIK: the export, and whose identifiers it revealed. */
  private async recordExportAudit(params: {
    report: TaxReportRecord;
    templateVersion: CoretaxFakturTemplateVersionValue;
    invoiceIds: string[];
    fakturCount: number;
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
        fakturCount: params.fakturCount,
        totals: report.summary.totals,
      },
    });
    await this.auditService.record({
      action: 'PATIENT_IDENTIFIER_UNMASKED',
      resource: TAX_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      actorUserId: actor.sub,
      metadata: {
        period: report.period,
        format: EXPORT_FORMAT,
        fields: ['nik'],
        invoiceIds: params.invoiceIds,
      },
    });
  }
}
