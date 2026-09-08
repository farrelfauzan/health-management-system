import {
  DELIVERY_CHANNELS,
  EnqueueLabReportPayload,
  LabOrderRecord,
  LabReportDownloadView,
  LabReportRecord,
  LabReportRenderContext,
  LabReportView,
  LabReportWorkerConfig,
  LabWorklistOrderRecord,
  TemplateSettingsValue,
} from '@hms/shared-types';
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { PdfRenderOptions, PdfRendererService } from '../../../common/pdf';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { PatientDocumentDeliveryService } from '../../document-delivery/service/patient-document-delivery.service';
import { DocumentTemplateService } from '../../document-template/service/document-template.service';
import { resolveLabReportWorkerConfig } from '../lab-report.config';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabReportRepository } from '../repository/lab-report.repository';
import { LabResultRepository } from '../repository/lab-result.repository';
import { buildLabReportContext } from './build-lab-report-context';
import { buildLabReportHtml } from './build-lab-report-html';
import { BUILT_IN_LAB_REPORT_TEMPLATE } from './built-in-lab-report-template';
import { LabOrderAccessService } from './lab-order-access.service';
import { LabReportMapper } from './lab-report.mapper';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const PDF_CONTENT_TYPE = 'application/pdf';

const LAB_REPORT_STORAGE_KEY_PREFIX = 'lab-report/document';

const LAB_RESULT_CATEGORY = 'LAB_RESULT';

const BACKOFF_EXPONENT_BASE = 2;

const MAX_ERROR_LENGTH = 500;

const MILLIMETRES_PER_INCH = 25.4;

const PAPER_DIMENSIONS_INCHES: Readonly<
  Record<TemplateSettingsValue['paperSize'], { width: number; height: number }>
> = {
  A4: { width: 8.27, height: 11.69 },
  A5: { width: 5.83, height: 8.27 },
  LETTER: { width: 8.5, height: 11 },
};

/**
 * The hasil laboratorium as a document (P18-T05): the sheet the patient
 * leaves with, kept in the record as the same artefact.
 *
 * Two halves. The release path only *queues* — `enqueueForOrder` writes a
 * `PENDING` version and returns, so signing out a report never waits on the
 * Gotenberg sidecar and a sidecar that is down costs the clinic a delayed PDF,
 * not a blocked bench. The worker path — `renderClaimedReport` — does the
 * rest under a lease: gather, fill, render, upload, file as the patient's
 * `LAB_RESULT` document, hand it to delivery, audit. A failure anywhere in
 * that chain reschedules the row with backoff and, after the last attempt,
 * parks it `FAILED` where the order detail can say so.
 *
 * Every amendment queues the next version rather than touching the last:
 * somebody may be holding the sheet the previous version printed, and the
 * record has to be able to show what they are holding.
 */
@Injectable()
export class LabReportService {
  private readonly logger = new Logger(LabReportService.name);

  private readonly clinicTimeZone: string;

  private readonly workerConfig: LabReportWorkerConfig;

  constructor(
    private readonly labReportRepository: LabReportRepository,
    private readonly labOrderRepository: LabOrderRepository,
    private readonly labResultRepository: LabResultRepository,
    private readonly labOrderAccessService: LabOrderAccessService,
    private readonly labReportMapper: LabReportMapper,
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly patientDocumentDeliveryService: PatientDocumentDeliveryService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
    this.workerConfig = resolveLabReportWorkerConfig(configService);
  }

  /**
   * Queues the next version of an order's report. Best-effort by design: the
   * release that calls this has already committed, and a queue write that
   * failed must not turn a signed-out report into a 500 — it is logged, and
   * the next amendment queues a fresh row.
   */
  async enqueueForOrder(payload: EnqueueLabReportPayload): Promise<LabReportRecord | null> {
    try {
      return await this.labReportRepository.enqueue(payload);
    } catch (caughtError) {
      this.logger.error(
        buildSafeErrorLog('lab_report_enqueue_failed', {
          labOrderId: payload.labOrderId,
          error: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return null;
    }
  }

  /** One claimed version, end to end. Never throws: the worker's sweep must go on to the next row. */
  async renderClaimedReport(report: LabReportRecord): Promise<void> {
    try {
      await this.executeRender(report);
    } catch (caughtError) {
      await this.settleFailure(report, caughtError);
    }
  }

  /** The versions of one order's report, under the order's own read rule. */
  async listReports(labOrderId: string, currentUser: CurrentUser): Promise<LabReportView> {
    await this.assertCanReadOrder(labOrderId, currentUser);
    const records = await this.labReportRepository.listByOrderId(labOrderId);
    return this.labReportMapper.toReportView(labOrderId, records);
  }

  /**
   * A signed URL for the current version. 404 when nothing has ever rendered,
   * 409 while the first render is still queued or has failed — the order
   * detail reads the versions route to say which.
   */
  async createDownloadUrl(
    labOrderId: string,
    currentUser: CurrentUser,
  ): Promise<LabReportDownloadView> {
    const order = await this.assertCanReadOrder(labOrderId, currentUser);
    const file = await this.labReportRepository.findCurrentFileByOrderId(labOrderId);
    if (file === null) {
      await this.assertNothingPending(labOrderId);
      throw new NotFoundException('No report has been rendered for this order');
    }
    const fileName = this.buildDownloadFileName(order.orderNumber, file.version);
    const signed = await this.objectStorageService.getSignedUrl({
      key: file.storageKey,
      responseContentDisposition: `attachment; filename="${fileName}"`,
      responseContentType: PDF_CONTENT_TYPE,
    });
    return {
      documentId: file.documentId ?? '',
      version: file.version,
      isAmended: file.isAmended,
      renderedAt: (file.renderedAt ?? file.createdAt).toISOString(),
      fileName,
      url: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  private async executeRender(report: LabReportRecord): Promise<void> {
    const order = await this.findOrderOrThrow(report.labOrderId);
    const worklistOrder = await this.findWorklistOrderOrThrow(report.labOrderId);
    const context = await this.buildContext(report, order, worklistOrder);
    const layout = await this.resolveLayout();
    const html = buildLabReportHtml({
      contentHtml: layout.contentHtml,
      values: context.values,
      lines: context.lines,
    });
    const bytes = await this.pdfRendererService.render(
      html,
      this.buildRenderOptions(layout.settings),
    );
    const body = Buffer.from(bytes);
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: LAB_REPORT_STORAGE_KEY_PREFIX,
      fileExtension: 'pdf',
    });
    await this.objectStorageService.uploadObject({
      key: storageKey,
      body,
      contentType: PDF_CONTENT_TYPE,
    });
    const filed = await this.labReportRepository.fileDocument({
      reportId: report.id,
      storageKey,
      sizeBytes: body.byteLength,
      pageCount: await this.countPdfPages(body),
      title: context.title,
      patientId: order.patientId,
      encounterId: order.encounterId,
      documentDate: report.releasedAt,
      actorUserId: report.requestedById,
    });
    const dispatch = await this.dispatchToPatient(filed.documentId, report);
    await this.auditService.record({
      action: 'LAB_REPORT_FILED',
      resource: 'LabReport',
      resourceId: report.id,
      actorUserId: report.requestedById,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        documentId: filed.documentId,
        version: report.version,
        isAmended: report.isAmended,
        dispatchedChannels: dispatch.dispatched,
        refusedChannels: dispatch.refused,
      },
    });
  }

  /**
   * The gathered sheet. The verifier is the account whose signature queued
   * this version; the banner names the release the previous version reported,
   * read from that row rather than recomputed, so two amendments in a row each
   * name the sheet they replaced.
   */
  private async buildContext(
    report: LabReportRecord,
    order: LabOrderRecord,
    worklistOrder: LabWorklistOrderRecord,
  ): Promise<LabReportRenderContext> {
    const verifier = await this.labReportRepository.findVerifier(report.requestedById);
    if (verifier === null) {
      throw new NotFoundException('The account that released this report no longer exists');
    }
    const results = await this.labResultRepository.findResultsByOrderId(order.id);
    const versions = await this.labReportRepository.listByOrderId(order.id);
    const superseded = report.isAmended
      ? (versions.find((candidate) => candidate.version === report.version - 1) ?? null)
      : null;
    return buildLabReportContext({
      order,
      patient: worklistOrder.patient,
      results,
      clinic: await this.clinicProfileService.getProfile(),
      clinicLogoDataUri: null,
      verifierName: verifier.displayName,
      releasedAt: report.releasedAt,
      supersededReleasedAt: superseded?.releasedAt ?? null,
      timeZone: this.clinicTimeZone,
    });
  }

  /**
   * The patient's end of dual delivery (`P16-T40`): every channel is asked
   * for and the consent gate refuses the ones the patient has not opened —
   * a refusal is a fact on the audit row, never a failure of the render.
   * Skipped entirely when the clinic has taken `LAB_RESULT` out of the
   * dispatch-by-default set, which is the switch for "we hand the sheet over
   * at the counter and send nothing".
   */
  private async dispatchToPatient(
    documentId: string,
    report: LabReportRecord,
  ): Promise<{ dispatched: string[]; refused: string[] }> {
    if (!this.patientDocumentDeliveryService.isDispatchByDefault(LAB_RESULT_CATEGORY)) {
      return { dispatched: [], refused: [] };
    }
    try {
      const verifier = await this.labReportRepository.findVerifier(report.requestedById);
      const result = await this.patientDocumentDeliveryService.requestDispatch(
        documentId,
        { channels: [...DELIVERY_CHANNELS] },
        { sub: report.requestedById, email: verifier?.email ?? '' },
      );
      return {
        dispatched: result.deliveries.map((delivery) => delivery.channel),
        refused: result.refused.map((refusal) => `${refusal.channel}:${refusal.refusalReason}`),
      };
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('lab_report_dispatch_failed', {
          reportId: report.id,
          error: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return { dispatched: [], refused: [] };
    }
  }

  /**
   * Exponential backoff up to the configured attempts, then `FAILED`. The
   * order stays RELEASED throughout — the signature is the clinical act, and
   * a sidecar outage does not un-sign anything.
   */
  private async settleFailure(report: LabReportRecord, caughtError: unknown): Promise<void> {
    const reason = describeError(caughtError);
    const attemptNumber = report.attemptCount + 1;
    const isLastAttempt = attemptNumber >= this.workerConfig.maxAttempts;
    const delayMs =
      this.workerConfig.retryBaseDelayMs * BACKOFF_EXPONENT_BASE ** (attemptNumber - 1);
    this.logger.error(
      buildSafeErrorLog(isLastAttempt ? 'lab_report_render_failed' : 'lab_report_render_retry', {
        reportId: report.id,
        attempt: attemptNumber,
        error: caughtError instanceof Error ? caughtError.name : 'unknown',
      }),
    );
    await this.labReportRepository.rescheduleAttempt({
      id: report.id,
      error: reason,
      nextAttemptAt: isLastAttempt ? null : new Date(Date.now() + delayMs),
    });
  }

  private async resolveLayout(): Promise<{ contentHtml: string; settings: TemplateSettingsValue }> {
    const published = await this.documentTemplateService.findDefaultPublishedVersion('LAB_REPORT');
    if (published === null) {
      return BUILT_IN_LAB_REPORT_TEMPLATE;
    }
    return { contentHtml: published.contentHtml, settings: published.settings };
  }

  private buildRenderOptions(settings: TemplateSettingsValue): PdfRenderOptions {
    const paper = PAPER_DIMENSIONS_INCHES[settings.paperSize];
    return {
      paperWidthInches: paper.width,
      paperHeightInches: paper.height,
      landscape: settings.orientation === 'LANDSCAPE',
      marginInches: {
        top: this.toInches(settings.marginMm.top),
        right: this.toInches(settings.marginMm.right),
        bottom: this.toInches(settings.marginMm.bottom),
        left: this.toInches(settings.marginMm.left),
      },
      printBackground: true,
    };
  }

  private toInches(millimetres: number): number {
    return Math.round((millimetres / MILLIMETRES_PER_INCH) * 100) / 100;
  }

  private async countPdfPages(body: Buffer): Promise<number | null> {
    const parser = new PDFParse({ data: new Uint8Array(body) });
    try {
      const parsed = await parser.getText({ pageJoiner: '' });
      return parsed.total ?? null;
    } catch {
      return null;
    } finally {
      await parser.destroy();
    }
  }

  /** The report is read by whoever may read the order — the same OWN/ANY rule the letter uses. */
  private async assertCanReadOrder(
    labOrderId: string,
    currentUser: CurrentUser,
  ): Promise<LabOrderRecord> {
    const order = await this.findOrderOrThrow(labOrderId);
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'read');
    // An order raised outside a consultation has no attending practitioner for
    // `:own` to resolve through (P18-T10), so only the clinic-wide grant reaches
    // its report.
    if (order.encounterId === null) {
      if (!scope.hasAny) {
        throw new ForbiddenException(
          'You are not allowed to read laboratory reports raised outside an encounter',
        );
      }
      return order;
    }
    const encounter = await this.labOrderRepository.findEncounterForOrdering(order.encounterId);
    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }
    this.labOrderAccessService.assertCanReadEncounterOrders({ encounter, scope, currentUser });
    return order;
  }

  private async assertNothingPending(labOrderId: string): Promise<void> {
    const versions = await this.labReportRepository.listByOrderId(labOrderId);
    const latest = versions[0];
    if (latest?.status === 'PENDING') {
      throw new ConflictException('The report is still being rendered; try again shortly');
    }
    if (latest?.status === 'FAILED') {
      throw new ConflictException('The last report render failed; see the order for the reason');
    }
  }

  private buildDownloadFileName(orderNumber: string, version: number): string {
    const safeNumber = orderNumber.replace(/[^A-Za-z0-9]+/g, '-');
    return `hasil-lab-${safeNumber}-v${version}.pdf`;
  }

  private async findOrderOrThrow(labOrderId: string): Promise<LabOrderRecord> {
    const order = await this.labOrderRepository.findLabOrderById(labOrderId);
    if (!order) {
      throw new NotFoundException('Lab order not found');
    }
    return order;
  }

  private async findWorklistOrderOrThrow(labOrderId: string): Promise<LabWorklistOrderRecord> {
    const order = await this.labOrderRepository.findWorklistOrderById(labOrderId);
    if (!order) {
      throw new NotFoundException('Lab order not found');
    }
    return order;
  }
}

function describeError(caughtError: unknown): string {
  const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
  return message.slice(0, MAX_ERROR_LENGTH);
}
