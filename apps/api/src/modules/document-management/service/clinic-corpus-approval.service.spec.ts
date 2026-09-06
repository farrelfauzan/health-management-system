import { ConflictException } from '@nestjs/common';

import { DocumentRecord, DocumentTypeRecord, ManagedDocumentRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentApprovalService } from '../../managed-document/service/document-approval.service';
import { DocumentTypeService } from '../../managed-document/service/document-type.service';
import { ManagedDocumentService } from '../../managed-document/service/managed-document.service';
import { ClinicCorpusApprovalService } from './clinic-corpus-approval.service';

const ACTOR: CurrentUser = { sub: 'admin-1' } as CurrentUser;

describe('ClinicCorpusApprovalService', () => {
  const documentTypeServiceMock = { findTypeByCode: jest.fn() };
  const managedDocumentServiceMock = {
    findGovernedDocument: jest.fn(),
    findGovernedDocuments: jest.fn(),
    syncGovernedDocument: jest.fn(),
    returnGovernedDocumentToDraft: jest.fn(),
  };
  const approvalServiceMock = {
    findOpenRound: jest.fn(),
    findOpenRounds: jest.fn(),
    listRounds: jest.fn(),
    submitForApproval: jest.fn(),
  };

  const service = new ClinicCorpusApprovalService(
    documentTypeServiceMock as unknown as DocumentTypeService,
    managedDocumentServiceMock as unknown as ManagedDocumentService,
    approvalServiceMock as unknown as DocumentApprovalService,
  );

  function buildDocument(): DocumentRecord {
    return {
      id: 'document-1',
      title: 'SOP Pendaftaran',
      storageKey: 'clinic-documents/abc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
    } as DocumentRecord;
  }

  function buildGoverned(
    status: ManagedDocumentRecord['status'],
    allowSelfApproval = false,
  ): ManagedDocumentRecord {
    return {
      id: 'managed-1',
      status,
      type: { requiredApprovals: 1, isApprovalRequired: true, allowSelfApproval },
    } as unknown as ManagedDocumentRecord;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(null);
    approvalServiceMock.findOpenRound.mockResolvedValue(null);
    approvalServiceMock.listRounds.mockResolvedValue([]);
    documentTypeServiceMock.findTypeByCode.mockResolvedValue({
      code: 'CLINIC_CORPUS_DOCUMENT',
      isApprovalRequired: true,
    } as DocumentTypeRecord);
  });

  describe('ingestion gate (FR-E5-19)', () => {
    it('holds a confirmed upload out of the queue while the policy is on', async () => {
      await expect(service.resolveGatedIngestStatus('PENDING')).resolves.toBe('NOT_APPLICABLE');
    });

    it('queues it normally while the policy is off', async () => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue({
        isApprovalRequired: false,
      } as DocumentTypeRecord);

      await expect(service.resolveGatedIngestStatus('PENDING')).resolves.toBe('PENDING');
    });

    it('leaves a status that was never headed for the queue alone', async () => {
      await expect(service.resolveGatedIngestStatus('NOT_APPLICABLE')).resolves.toBe(
        'NOT_APPLICABLE',
      );
    });

    it('reads as off when the type row has not been seeded', async () => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue(null);

      await expect(service.resolveGatedIngestStatus('PENDING')).resolves.toBe('PENDING');
    });
  });

  describe('manual re-ingest gate (§7.5.8)', () => {
    it('refuses a document whose registry row is still pending', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(
        buildGoverned('PENDING_APPROVAL'),
      );

      await expect(service.assertIngestAllowed(buildDocument())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows one whose registry row is issued', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('ISSUED'));

      await expect(service.assertIngestAllowed(buildDocument())).resolves.toBeUndefined();
    });

    it('allows one that was never governed — the grandfathered case (OQ-18)', async () => {
      await expect(service.assertIngestAllowed(buildDocument())).resolves.toBeUndefined();
    });
  });

  describe('visibility re-approval (FR-E5-20)', () => {
    it('asks for re-approval only when the document is currently issued', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('ISSUED'));

      await expect(service.requiresReapprovalOnVisibilityChange('document-1')).resolves.toBe(true);
    });

    it('asks for nothing when the document was never governed', async () => {
      await expect(service.requiresReapprovalOnVisibilityChange('document-1')).resolves.toBe(false);
    });

    it('re-submits to the panel that approved it last', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('ISSUED'));
      approvalServiceMock.listRounds.mockResolvedValue([
        {
          status: 'APPROVED',
          approvers: [{ approverId: 'approver-1', isEligible: true }],
        },
      ]);

      await service.reopenForVisibilityChange('document-1', ACTOR);

      expect(managedDocumentServiceMock.returnGovernedDocumentToDraft).toHaveBeenCalled();
      expect(approvalServiceMock.submitForApproval).toHaveBeenCalledWith(
        'managed-1',
        { approverIds: ['approver-1'] },
        ACTOR,
      );
    });

    it('leaves the row in DRAFT when there is no panel to re-ask', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('ISSUED'));

      await service.reopenForVisibilityChange('document-1', ACTOR);

      expect(managedDocumentServiceMock.returnGovernedDocumentToDraft).toHaveBeenCalled();
      expect(approvalServiceMock.submitForApproval).not.toHaveBeenCalled();
    });

    it('leaves the row in DRAFT rather than opening a round only the editor could sign', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(buildGoverned('ISSUED'));
      approvalServiceMock.listRounds.mockResolvedValue([
        { status: 'APPROVED', approvers: [{ approverId: ACTOR.sub, isEligible: true }] },
      ]);

      await service.reopenForVisibilityChange('document-1', ACTOR);

      expect(approvalServiceMock.submitForApproval).not.toHaveBeenCalled();
    });

    it('does re-submit to a sole self-approver when the type allows self-approval', async () => {
      managedDocumentServiceMock.findGovernedDocument.mockResolvedValue(
        buildGoverned('ISSUED', true),
      );
      approvalServiceMock.listRounds.mockResolvedValue([
        { status: 'APPROVED', approvers: [{ approverId: ACTOR.sub, isEligible: true }] },
      ]);

      await service.reopenForVisibilityChange('document-1', ACTOR);

      expect(approvalServiceMock.submitForApproval).toHaveBeenCalled();
    });
  });

  describe('send for review (R-19)', () => {
    it('registers a document even while the policy is off — the admin has already decided', async () => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue({
        isApprovalRequired: false,
      } as DocumentTypeRecord);
      managedDocumentServiceMock.syncGovernedDocument.mockResolvedValue(buildGoverned('DRAFT'));

      await service.sendForReview(buildDocument(), ACTOR);

      expect(managedDocumentServiceMock.syncGovernedDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          typeCode: 'CLINIC_CORPUS_DOCUMENT',
          subject: { kind: 'STORE_DOCUMENT', id: 'document-1' },
        }),
        ACTOR,
      );
    });

    it('writes nothing on an ordinary upload while the policy is off', async () => {
      documentTypeServiceMock.findTypeByCode.mockResolvedValue({
        isApprovalRequired: false,
      } as DocumentTypeRecord);

      await expect(service.syncRegistryRow(buildDocument(), ACTOR)).resolves.toBeNull();
      expect(managedDocumentServiceMock.syncGovernedDocument).not.toHaveBeenCalled();
    });
  });

  describe('list view', () => {
    it('reports every document in one pass, governed or not', async () => {
      managedDocumentServiceMock.findGovernedDocuments.mockResolvedValue(
        new Map([['document-1', buildGoverned('ISSUED')]]),
      );
      approvalServiceMock.findOpenRounds.mockResolvedValue(new Map());

      const actual = await service.resolveApprovalViews(['document-1', 'document-2']);

      expect(actual.get('document-1')?.status).toBe('ISSUED');
      expect(actual.get('document-2')?.managedDocumentId).toBeNull();
      expect(managedDocumentServiceMock.findGovernedDocuments).toHaveBeenCalledTimes(1);
    });
  });
});
