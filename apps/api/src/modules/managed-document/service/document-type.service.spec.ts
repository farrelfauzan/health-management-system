import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DocumentTypeRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { DocumentTypeRepository } from '../repository/document-type.repository';
import {
  DOCUMENT_TYPE_APPROVER_INVALID_ERROR_CODE,
  DOCUMENT_TYPE_CODE_TAKEN_ERROR_CODE,
  DocumentTypeService,
} from './document-type.service';

describe('DocumentTypeService', () => {
  const actor = { sub: 'admin-user', email: 'admin@hms.local' } as CurrentUser;

  const repositoryMock = {
    listTypes: jest.fn(),
    findById: jest.fn(),
    listAllCodes: jest.fn(),
    createType: jest.fn(),
    updateType: jest.fn(),
    softDeleteType: jest.fn(),
    replaceDefaultApprovers: jest.fn(),
    findApproverCandidates: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  const service = new DocumentTypeService(
    repositoryMock as unknown as DocumentTypeRepository,
    auditServiceMock as unknown as AuditService,
  );

  function buildRecord(overrides: Partial<DocumentTypeRecord> = {}): DocumentTypeRecord {
    return {
      id: 'type-1',
      code: 'LETTER',
      name: 'Surat',
      description: null,
      behavior: 'GENERIC',
      isSystem: false,
      isApprovalRequired: false,
      allowSelfApproval: false,
      requiredApprovals: 1,
      requiresPatient: false,
      requiresDoctor: false,
      contentMode: 'EITHER',
      isActive: true,
      sortOrder: 0,
      documentCount: 0,
      defaultApprovers: [],
      createdAt: new Date('2026-09-30T00:00:00Z'),
      updatedAt: new Date('2026-09-30T00:00:00Z'),
      ...overrides,
    };
  }

  function recordedActions(): AuditAction[] {
    return auditServiceMock.record.mock.calls.map(
      (call) => (call[0] as { action: AuditAction }).action,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listAllCodes.mockResolvedValue([]);
    repositoryMock.createType.mockImplementation(async (payload) =>
      buildRecord({ ...payload, id: 'type-new' }),
    );
    repositoryMock.updateType.mockImplementation(async (payload) => buildRecord(payload));
  });

  describe('createType', () => {
    it('sets behavior to GENERIC and generates the code from the name', async () => {
      repositoryMock.listAllCodes.mockResolvedValue(['SURAT_KETERANGAN_SEHAT']);

      const actual = await service.createType(
        {
          name: 'Surat Keterangan Sehat',
          isApprovalRequired: false,
          allowSelfApproval: false,
          requiredApprovals: 1,
          requiresPatient: true,
          requiresDoctor: false,
          contentMode: 'DRAFTED',
          isActive: true,
          sortOrder: 0,
        },
        actor,
      );

      expect(repositoryMock.createType).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'GENERIC', code: 'SURAT_KETERANGAN_SEHAT_2' }),
      );
      expect(actual.behavior).toBe('GENERIC');
      expect(recordedActions()).toEqual([AuditAction.CREATE]);
    });

    it('audits a non-default policy at birth, self-approval included', async () => {
      await service.createType(
        {
          name: 'Kebijakan',
          isApprovalRequired: true,
          allowSelfApproval: true,
          requiredApprovals: 1,
          requiresPatient: false,
          requiresDoctor: false,
          contentMode: 'EITHER',
          isActive: true,
          sortOrder: 0,
        },
        actor,
      );

      expect(recordedActions()).toEqual([
        AuditAction.CREATE,
        AuditAction.APPROVAL_POLICY_CHANGED,
        AuditAction.SELF_APPROVAL_ENABLED,
      ]);
    });
  });

  describe('updateType', () => {
    it('refuses a code change on a system row and leaves it untouched', async () => {
      repositoryMock.findById.mockResolvedValue(
        buildRecord({ isSystem: true, code: 'INVOICE_TEMPLATE', behavior: 'INVOICE_TEMPLATE' }),
      );

      await expect(
        service.updateType('type-1', { code: 'MY_TEMPLATE' }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repositoryMock.updateType).not.toHaveBeenCalled();
    });

    it('renames a system row without touching its code or behavior', async () => {
      repositoryMock.findById.mockResolvedValue(
        buildRecord({ isSystem: true, code: 'INVOICE_TEMPLATE', behavior: 'INVOICE_TEMPLATE' }),
      );
      repositoryMock.updateType.mockResolvedValue(
        buildRecord({
          isSystem: true,
          code: 'INVOICE_TEMPLATE',
          behavior: 'INVOICE_TEMPLATE',
          name: 'Templat kuitansi',
        }),
      );

      const actual = await service.updateType('type-1', { name: 'Templat kuitansi' }, actor);

      expect(repositoryMock.updateType).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'type-1', name: 'Templat kuitansi', code: undefined }),
      );
      expect(actual.code).toBe('INVOICE_TEMPLATE');
      expect(actual.behavior).toBe('INVOICE_TEMPLATE');
      expect(recordedActions()).toEqual([AuditAction.UPDATE]);
    });

    it('writes SELF_APPROVAL_ENABLED when self-approval flips on', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord({ isApprovalRequired: true }));
      repositoryMock.updateType.mockResolvedValue(
        buildRecord({ isApprovalRequired: true, allowSelfApproval: true }),
      );

      await service.updateType('type-1', { allowSelfApproval: true }, actor);

      expect(recordedActions()).toEqual([
        AuditAction.UPDATE,
        AuditAction.APPROVAL_POLICY_CHANGED,
        AuditAction.SELF_APPROVAL_ENABLED,
      ]);
      const policyEvent = auditServiceMock.record.mock.calls[1]?.[0] as {
        metadata: { changedFields: string[] };
      };
      expect(policyEvent.metadata.changedFields).toEqual(['allowSelfApproval']);
    });

    it('does not write a policy event when only the name changed', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.updateType.mockResolvedValue(buildRecord({ name: 'Surat resmi' }));

      await service.updateType('type-1', { name: 'Surat resmi' }, actor);

      expect(recordedActions()).toEqual([AuditAction.UPDATE]);
    });

    it('translates a code collision into 409', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.updateType.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const actualError = await service
        .updateType('type-1', { code: 'CONSENT_FORM' }, actor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect((actualError as ConflictException).getResponse()).toMatchObject({
        code: DOCUMENT_TYPE_CODE_TAKEN_ERROR_CODE,
      });
    });

    it('answers 404 for an unknown or deleted type', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.updateType('missing', { name: 'x' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('deleteType', () => {
    it('refuses a system row', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord({ isSystem: true }));

      await expect(service.deleteType('type-1', actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repositoryMock.softDeleteType).not.toHaveBeenCalled();
    });

    it('refuses a type in use with the count and the deactivate hint', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord({ documentCount: 7 }));

      const actualError = await service.deleteType('type-1', actor).catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect((actualError as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_TYPE_IN_USE',
        errors: { documentCount: 7 },
      });
      expect(repositoryMock.softDeleteType).not.toHaveBeenCalled();
    });

    it('soft-deletes an unused clinic type and audits it', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());

      const actual = await service.deleteType('type-1', actor);

      expect(repositoryMock.softDeleteType).toHaveBeenCalledWith('type-1', expect.any(Date));
      expect(actual.id).toBe('type-1');
      expect(recordedActions()).toEqual([AuditAction.DELETE]);
    });
  });

  describe('setDefaultApprovers', () => {
    it('refuses a patient or an unknown id, naming both', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.findApproverCandidates.mockResolvedValue([
        { id: 'staff-1', email: 'staff@hms.local', isPatient: false },
        { id: 'patient-1', email: 'patient@hms.local', isPatient: true },
      ]);

      const actualError = await service
        .setDefaultApprovers('type-1', { approverIds: ['staff-1', 'patient-1', 'ghost'] }, actor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(UnprocessableEntityException);
      expect((actualError as UnprocessableEntityException).getResponse()).toMatchObject({
        code: DOCUMENT_TYPE_APPROVER_INVALID_ERROR_CODE,
        errors: { approverIds: ['patient-1', 'ghost'] },
      });
      expect(repositoryMock.replaceDefaultApprovers).not.toHaveBeenCalled();
    });

    it('replaces the set when every id is staff', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.findApproverCandidates.mockResolvedValue([
        { id: 'staff-1', email: 'staff@hms.local', isPatient: false },
      ]);

      await service.setDefaultApprovers('type-1', { approverIds: ['staff-1'] }, actor);

      expect(repositoryMock.replaceDefaultApprovers).toHaveBeenCalledWith('type-1', ['staff-1']);
      expect(recordedActions()).toEqual([AuditAction.UPDATE]);
    });
  });

  describe('findActiveTypeOrThrow', () => {
    it('treats a deactivated type as absent for the picker', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord({ isActive: false }));

      await expect(service.findActiveTypeOrThrow('type-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
