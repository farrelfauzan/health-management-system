import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { PdfRendererService } from '../../../common/pdf';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { PatientDocumentDeliveryService } from '../../document-delivery/service/patient-document-delivery.service';
import { DocumentTemplateService } from '../../document-template/service/document-template.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabReportRepository } from '../repository/lab-report.repository';
import { LabResultRepository } from '../repository/lab-result.repository';
import { LabOrderAccessService } from './lab-order-access.service';
import { LabReportMapper } from './lab-report.mapper';
import { LabReportService } from './lab-report.service';

/**
 * The worker half of the report (P18-T05): a claimed row becomes a filed
 * document handed to delivery, or is put back with backoff, and after the
 * last attempt is parked where the order can say why. The render itself is a
 * stub — what is under test is the chain around it.
 */
describe('LabReportService', () => {
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const encounterId = 'e1e2e3e4-5555-4555-8555-e1e2e3e4e5e6';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const verifierUserId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  const documentId = '88888888-dddd-4ddd-8ddd-888888888888';
  const releasedAt = new Date('2026-09-07T04:40:00.000Z');
  const currentUser = { sub: verifierUserId, email: 'dokter@hms.local' };

  const labReportRepositoryMock = {
    enqueue: jest.fn(),
    claimDueReports: jest.fn(),
    findById: jest.fn(),
    listByOrderId: jest.fn(),
    findCurrentFileByOrderId: jest.fn(),
    fileDocument: jest.fn(),
    rescheduleAttempt: jest.fn(),
    findVerifier: jest.fn(),
  };
  const labOrderRepositoryMock = {
    findLabOrderById: jest.fn(),
    findWorklistOrderById: jest.fn(),
    findEncounterForOrdering: jest.fn(),
  };
  const labResultRepositoryMock = { findResultsByOrderId: jest.fn() };
  const labOrderAccessServiceMock = {
    resolveScopeOrThrow: jest.fn(),
    assertCanReadEncounterOrders: jest.fn(),
  };
  const documentTemplateServiceMock = { findDefaultPublishedVersion: jest.fn() };
  const pdfRendererServiceMock = { render: jest.fn() };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getSignedUrl: jest.fn(),
  };
  const clinicProfileServiceMock = { getProfile: jest.fn() };
  const patientDocumentDeliveryServiceMock = {
    isDispatchByDefault: jest.fn(),
    requestDispatch: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };
  const configValues: Record<string, string> = {
    CLINIC_TIMEZONE: 'Asia/Jakarta',
    LAB_REPORT_MAX_ATTEMPTS: '3',
    LAB_REPORT_RETRY_BASE_DELAY_MS: '1000',
  };
  const configServiceMock = { get: jest.fn((key: string) => configValues[key]) };

  const service = new LabReportService(
    labReportRepositoryMock as unknown as LabReportRepository,
    labOrderRepositoryMock as unknown as LabOrderRepository,
    labResultRepositoryMock as unknown as LabResultRepository,
    labOrderAccessServiceMock as unknown as LabOrderAccessService,
    new LabReportMapper(),
    documentTemplateServiceMock as unknown as DocumentTemplateService,
    pdfRendererServiceMock as unknown as PdfRendererService,
    objectStorageServiceMock as unknown as ObjectStorageService,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    patientDocumentDeliveryServiceMock as unknown as PatientDocumentDeliveryService,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  function buildReport(overrides: Record<string, unknown> = {}) {
    return {
      id: '77777777-eeee-4eee-8eee-777777777777',
      labOrderId,
      version: 1,
      status: 'PENDING' as const,
      isAmended: false,
      releasedAt,
      documentId: null,
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
      renderedAt: null,
      pageCount: null,
      requestedById: verifierUserId,
      createdAt: releasedAt,
      ...overrides,
    };
  }

  function buildOrder() {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260907/0001',
      encounterId,
      patientId,
      orderedById: 'd1d2d3d4-6666-4666-8666-d1d2d3d4d5d6',
      orderedByName: 'dr. Andi Wijaya',
      status: 'RELEASED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      fulfilmentSite: 'INTERNAL' as const,
      chargeMode: 'CLINIC' as const,
      externalFacilityName: null,
      recollectCount: 0,
      orderedAt: releasedAt,
      cancelledAt: null,
      cancelReason: null,
      releasedAt,
      items: [],
      specimens: [],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder());
    labOrderRepositoryMock.findWorklistOrderById.mockResolvedValue({
      ...buildOrder(),
      itemCount: 0,
      orderedByLicenseNumber: null,
      patient: {
        id: patientId,
        fullName: 'Siti Rahayu',
        mrn: 'MRN00000123',
        dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
        sex: 'FEMALE' as const,
        bpjsNumberIndex: null,
      },
    });
    labOrderRepositoryMock.findEncounterForOrdering.mockResolvedValue({
      id: encounterId,
      status: 'FINISHED',
      patientId,
      doctorId: 'd1d2d3d4-6666-4666-8666-d1d2d3d4d5d6',
      doctorOwnerUserId: verifierUserId,
    });
    labResultRepositoryMock.findResultsByOrderId.mockResolvedValue([]);
    labReportRepositoryMock.findVerifier.mockResolvedValue({
      userId: verifierUserId,
      email: 'dokter@hms.local',
      displayName: 'dr. Andi Wijaya',
    });
    labReportRepositoryMock.listByOrderId.mockResolvedValue([buildReport()]);
    labReportRepositoryMock.fileDocument.mockResolvedValue({ documentId });
    documentTemplateServiceMock.findDefaultPublishedVersion.mockResolvedValue(null);
    pdfRendererServiceMock.render.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    objectStorageServiceMock.generateObjectKey.mockReturnValue('lab-report/document/x.pdf');
    objectStorageServiceMock.uploadObject.mockResolvedValue({ key: 'lab-report/document/x.pdf' });
    clinicProfileServiceMock.getProfile.mockResolvedValue({
      name: 'Klinik Sehat Bersama',
      legalName: null,
      address: null,
      phoneNumber: null,
      email: null,
      licenseNumber: null,
      taxId: null,
      hasLogo: false,
      updatedAt: releasedAt.toISOString(),
    });
    patientDocumentDeliveryServiceMock.isDispatchByDefault.mockReturnValue(true);
    patientDocumentDeliveryServiceMock.requestDispatch.mockResolvedValue({
      deliveries: [{ channel: 'WHATSAPP' }],
      refused: [{ channel: 'EMAIL', refusalReason: 'CONSENT_MISSING' }],
    });
    labOrderAccessServiceMock.resolveScopeOrThrow.mockResolvedValue({ scope: 'ANY' });
  });

  describe('queueing', () => {
    it('writes the next version and returns it', async () => {
      labReportRepositoryMock.enqueue.mockResolvedValue(buildReport());

      const actual = await service.enqueueForOrder({
        labOrderId,
        requestedById: verifierUserId,
        isAmended: false,
        releasedAt,
      });

      expect(actual?.version).toBe(1);
    });

    // The release has already committed. A queue write that failed is logged,
    // never thrown back into a response that says the report was signed out.
    it('swallows a queue failure rather than failing the release', async () => {
      labReportRepositoryMock.enqueue.mockRejectedValue(new Error('connection reset'));

      await expect(
        service.enqueueForOrder({
          labOrderId,
          requestedById: verifierUserId,
          isAmended: false,
          releasedAt,
        }),
      ).resolves.toBeNull();
    });
  });

  describe('rendering a claimed row', () => {
    it('renders, uploads, files the LAB_RESULT document released, and hands it to delivery', async () => {
      await service.renderClaimedReport(buildReport());

      expect(pdfRendererServiceMock.render).toHaveBeenCalledTimes(1);
      expect(objectStorageServiceMock.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'application/pdf' }),
      );
      expect(labReportRepositoryMock.fileDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Hasil laboratorium LAB/20260907/0001',
          patientId,
          encounterId,
          documentDate: releasedAt,
          actorUserId: verifierUserId,
        }),
      );
      expect(patientDocumentDeliveryServiceMock.requestDispatch).toHaveBeenCalledWith(
        documentId,
        { channels: ['WHATSAPP', 'EMAIL'] },
        { sub: verifierUserId, email: 'dokter@hms.local' },
      );
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_REPORT_FILED',
          metadata: expect.objectContaining({
            documentId,
            version: 1,
            dispatchedChannels: ['WHATSAPP'],
            refusedChannels: ['EMAIL:CONSENT_MISSING'],
          }),
        }),
      );
      expect(labReportRepositoryMock.rescheduleAttempt).not.toHaveBeenCalled();
    });

    it('uses the published LAB_REPORT layout when the clinic has one', async () => {
      documentTemplateServiceMock.findDefaultPublishedVersion.mockResolvedValue({
        contentHtml: '<p>Custom <span data-hms-var="order.number"></span></p>',
        settings: {
          paperSize: 'A5',
          orientation: 'LANDSCAPE',
          marginMm: { top: 10, right: 10, bottom: 10, left: 10 },
        },
      });

      await service.renderClaimedReport(buildReport());

      expect(documentTemplateServiceMock.findDefaultPublishedVersion).toHaveBeenCalledWith(
        'LAB_REPORT',
      );
      const [html, options] = pdfRendererServiceMock.render.mock.calls[0] as [
        string,
        { landscape: boolean; paperWidthInches: number },
      ];
      // The token span stays around the value — that is the grammar — so the
      // assertion is on the layout's own text and the filled number.
      expect(html).toContain('Custom <span');
      expect(html).toContain('LAB/20260907/0001');
      expect(options.landscape).toBe(true);
      expect(options.paperWidthInches).toBe(5.83);
    });

    // The banner names the release the previous version reported, read from
    // that row: two amendments in a row each name the sheet they replaced.
    it('names the superseded release on an amended version', async () => {
      const earlier = new Date('2026-09-07T02:00:00.000Z');
      labReportRepositoryMock.listByOrderId.mockResolvedValue([
        buildReport({ version: 2, isAmended: true }),
        buildReport({ version: 1, status: 'READY', releasedAt: earlier, documentId }),
      ]);

      await service.renderClaimedReport(buildReport({ version: 2, isAmended: true }));

      const [html] = pdfRendererServiceMock.render.mock.calls[0] as [string];
      expect(html).toContain('AMENDED — menggantikan laporan tanggal 7 September 2026, 09:00');
      expect(labReportRepositoryMock.fileDocument).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Hasil laboratorium LAB/20260907/0001 (revisi)' }),
      );
    });

    it('sends nothing when LAB_RESULT is not a dispatch-by-default category', async () => {
      patientDocumentDeliveryServiceMock.isDispatchByDefault.mockReturnValue(false);

      await service.renderClaimedReport(buildReport());

      expect(patientDocumentDeliveryServiceMock.requestDispatch).not.toHaveBeenCalled();
      expect(labReportRepositoryMock.fileDocument).toHaveBeenCalledTimes(1);
    });

    // A refused or failed send is a fact for the audit row, never a reason to
    // put a filed document back in the queue.
    it('keeps the filed document when delivery throws', async () => {
      patientDocumentDeliveryServiceMock.requestDispatch.mockRejectedValue(new Error('gateway'));

      await service.renderClaimedReport(buildReport());

      expect(labReportRepositoryMock.rescheduleAttempt).not.toHaveBeenCalled();
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ dispatchedChannels: [], refusedChannels: [] }),
        }),
      );
    });

    it('puts the row back with backoff when the sidecar is down, and the order stays released', async () => {
      pdfRendererServiceMock.render.mockRejectedValue(new Error('Renderer unavailable'));
      const before = Date.now();

      await service.renderClaimedReport(buildReport({ attemptCount: 1 }));

      expect(labReportRepositoryMock.fileDocument).not.toHaveBeenCalled();
      const [payload] = labReportRepositoryMock.rescheduleAttempt.mock.calls[0] as [
        { error: string; nextAttemptAt: Date | null },
      ];
      expect(payload.error).toBe('Renderer unavailable');
      // Attempt 2 of 3 waits base × 2¹.
      expect(payload.nextAttemptAt?.getTime()).toBeGreaterThanOrEqual(before + 2000);
    });

    it('parks the row FAILED after the last attempt', async () => {
      pdfRendererServiceMock.render.mockRejectedValue(new Error('Renderer unavailable'));

      await service.renderClaimedReport(buildReport({ attemptCount: 2 }));

      expect(labReportRepositoryMock.rescheduleAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ nextAttemptAt: null }),
      );
    });
  });

  describe('downloading', () => {
    it('signs a URL for the current READY version under the order read rule', async () => {
      labReportRepositoryMock.findCurrentFileByOrderId.mockResolvedValue({
        ...buildReport({ status: 'READY', documentId, renderedAt: releasedAt }),
        storageKey: 'lab-report/document/x.pdf',
      });
      objectStorageServiceMock.getSignedUrl.mockResolvedValue({
        url: 'https://storage.example/x.pdf?sig',
        expiresAt: '2026-09-07T05:00:00.000Z',
      });

      const actual = await service.createDownloadUrl(labOrderId, currentUser);

      expect(labOrderAccessServiceMock.assertCanReadEncounterOrders).toHaveBeenCalled();
      expect(actual.fileName).toBe('hasil-lab-LAB-20260907-0001-v1.pdf');
      expect(actual.url).toBe('https://storage.example/x.pdf?sig');
      expect(objectStorageServiceMock.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'lab-report/document/x.pdf',
          responseContentDisposition: 'attachment; filename="hasil-lab-LAB-20260907-0001-v1.pdf"',
        }),
      );
    });

    it('answers 409 while the first render is still queued', async () => {
      labReportRepositoryMock.findCurrentFileByOrderId.mockResolvedValue(null);

      await expect(service.createDownloadUrl(labOrderId, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('answers 404 when nothing was ever queued', async () => {
      labReportRepositoryMock.findCurrentFileByOrderId.mockResolvedValue(null);
      labReportRepositoryMock.listByOrderId.mockResolvedValue([]);

      await expect(service.createDownloadUrl(labOrderId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists every version newest first with the READY one as current', async () => {
      labReportRepositoryMock.listByOrderId.mockResolvedValue([
        buildReport({ version: 2, status: 'FAILED', lastError: 'Renderer unavailable' }),
        buildReport({ version: 1, status: 'READY', documentId }),
      ]);

      const actual = await service.listReports(labOrderId, currentUser);

      expect(actual.versions.map((version) => version.version)).toEqual([2, 1]);
      expect(actual.current?.version).toBe(1);
      expect(actual.versions[0]?.lastError).toBe('Renderer unavailable');
    });
  });
});
