import { ConflictException } from '@nestjs/common';

import { DocumentTemplateRecord, DocumentTypeRecord, ManagedDocumentRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentApprovalService } from '../../managed-document/service/document-approval.service';
import { DocumentTypeService } from '../../managed-document/service/document-type.service';
import { ManagedDocumentService } from '../../managed-document/service/managed-document.service';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { DocumentTemplateApprovalService } from './document-template-approval.service';
import { DocumentTemplatePreviewService } from './document-template-preview.service';

const ACTOR: CurrentUser = { sub: 'admin-1' } as CurrentUser;

describe('DocumentTemplateApprovalService', () => {
  const documentTypeServiceMock = { findTypeByCode: jest.fn() };
  const managedDocumentServiceMock = {
    findGovernedDocument: jest.fn(),
    syncGovernedDocument: jest.fn(),
  };
  const approvalServiceMock = { findOpenRound: jest.fn() };
  const repositoryMock = { findById: jest.fn() };
  const previewServiceMock = { previewSubmittedHtml: jest.fn() };

  const service = new DocumentTemplateApprovalService(
    documentTypeServiceMock as unknown as DocumentTypeService,
    managedDocumentServiceMock as unknown as ManagedDocumentService,
    approvalServiceMock as unknown as DocumentApprovalService,
    repositoryMock as unknown as DocumentTemplateRepository,
    previewServiceMock as unknown as DocumentTemplatePreviewService,
  );

  function buildType(isApprovalRequired: boolean): DocumentTypeRecord {
    return { id: 'type-1', code: 'INVOICE_TEMPLATE', isApprovalRequired } as DocumentTypeRecord;
  }

  function buildTemplate(): DocumentTemplateRecord {
    return {
      id: 'template-1',
      name: 'Kuitansi A5',
      contentHtml: '<p>Total</p>',
    } as DocumentTemplateRecord;
  }

  function buildGoverned(status: ManagedDocumentRecord['status']): ManagedDocumentRecord {
    return {
      id: 'managed-1',
      status,
      type: { requiredApprovals: 1, isApprovalRequired: true },
    } as unknown as ManagedDocumentRecord;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(null);
    approvalServiceMock.findOpenRound.mockResolvedValue(null);
  });

  describe('policy off — the default posture (US-E5-06)', () => {
    beforeEach(() => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue(buildType(false));
    });

    it('lets a publish through untouched', async () => {
      await expect(service.assertPublishAllowed(buildTemplate())).resolves.toBeUndefined();
    });

    it('writes no registry row, so switching the feature off leaves no trace', async () => {
      const actual = await service.syncRegistryRow(buildTemplate(), ACTOR);

      expect(actual).toBeNull();
      expect(managedDocumentServiceMock.syncGovernedDocument).not.toHaveBeenCalled();
    });

    it('reports no approval chrome for the editor to draw', async () => {
      const actual = await service.resolveApprovalView('template-1');

      expect(actual).toEqual({
        isApprovalRequired: false,
        managedDocumentId: null,
        status: null,
        pendingRound: null,
      });
    });

    it('reads as off when the type row has not been seeded at all', async () => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue(null);

      await expect(service.assertPublishAllowed(buildTemplate())).resolves.toBeUndefined();
    });
  });

  describe('policy on', () => {
    beforeEach(() => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue(buildType(true));
    });

    it('refuses a direct publish and names the row to submit instead (§7.5.8)', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('DRAFT'));

      await expect(service.assertPublishAllowed(buildTemplate())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses even when no registry row exists yet, rather than publishing unreviewed', async () => {
      await expect(service.assertPublishAllowed(buildTemplate())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('mirrors the working copy onto the registry row so a submission has something to freeze', async () => {
      managedDocumentServiceMock.syncGovernedDocument.mockResolvedValue(buildGoverned('DRAFT'));

      await service.syncRegistryRow(buildTemplate(), ACTOR);

      expect(managedDocumentServiceMock.syncGovernedDocument).toHaveBeenCalledWith(
        {
          typeCode: 'INVOICE_TEMPLATE',
          subject: { kind: 'TEMPLATE', id: 'template-1' },
          title: 'Kuitansi A5',
          contentHtml: '<p>Total</p>',
        },
        ACTOR,
      );
    });

    it('reports the registry row and its status to the editor', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(
        buildGoverned('PENDING_APPROVAL'),
      );

      const actual = await service.resolveApprovalView('template-1');

      expect(actual.isApprovalRequired).toBe(true);
      expect(actual.managedDocumentId).toBe('managed-1');
      expect(actual.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('approver preview (FR-E5-21)', () => {
    beforeEach(() => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue(buildType(true));
      repositoryMock.findById.mockResolvedValue({
        id: 'template-1',
        contentHtml: '<p>Edited since submission</p>',
        latestPublishedVersion: { versionNumber: 3, contentHtml: '<p>Published</p>' },
      });
      previewServiceMock.previewSubmittedHtml.mockResolvedValue({
        url: 'https://objects.example/preview.pdf',
        expiresAt: '2026-09-06T12:00:00.000Z',
        warnings: [],
      });
    });

    it('renders the frozen submission, not the working copy the drafter has moved on to', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(
        buildGoverned('PENDING_APPROVAL'),
      );
      approvalServiceMock.findOpenRound.mockResolvedValue({
        frozenPayload: { contentHtml: '<p>Submitted</p>' },
      });

      const actual = await service.previewOpenSubmission('template-1', ACTOR);

      expect(previewServiceMock.previewSubmittedHtml).toHaveBeenCalledWith({
        templateId: 'template-1',
        contentHtml: '<p>Submitted</p>',
        actor: ACTOR,
      });
      expect(actual.baseVersionNumber).toBe(3);
      expect(actual.diff.some((segment) => segment.kind !== 'UNCHANGED')).toBe(true);
    });

    it('refuses when nothing is open to review', async () => {
      await expect(service.previewOpenSubmission('template-1', ACTOR)).rejects.toThrow(
        /no open approval request/,
      );
    });
  });
});
