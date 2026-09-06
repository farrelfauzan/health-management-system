import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateDocumentTypeInput,
  DEFAULT_DOCUMENT_TYPE_BEHAVIOR,
  DOCUMENT_TYPE_IN_USE_ERROR_CODE,
  DOCUMENT_TYPE_SYSTEM_ROW_ERROR_CODE,
  DeletedDocumentTypeView,
  DocumentTypeApprovalPolicy,
  DocumentTypeRecord,
  DocumentTypeView,
  ListDocumentTypesQueryInput,
  SetDocumentTypeDefaultApproversInput,
  UpdateDocumentTypeInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { DocumentTypeRepository } from '../repository/document-type.repository';
import { generateDocumentTypeCode } from './generate-document-type-code';
import { toDocumentTypeView } from './to-document-type-view';

const DOCUMENT_TYPE_AUDIT_RESOURCE = 'document-type';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

export const DOCUMENT_TYPE_CODE_TAKEN_ERROR_CODE = 'DOCUMENT_TYPE_CODE_TAKEN';

export const DOCUMENT_TYPE_APPROVER_INVALID_ERROR_CODE = 'DOCUMENT_TYPE_APPROVER_INVALID';

const APPROVAL_POLICY_FIELDS = [
  'isApprovalRequired',
  'allowSelfApproval',
  'requiredApprovals',
] as const;

/**
 * Document types as master data (`P16-T39`, FR-E5-31…39).
 *
 * Two rules carry the whole safety argument for letting a clinic define its
 * own types, and both live here rather than in the schema:
 *
 *   * **`behavior` is never accepted from a request** (FR-E5-32). The Zod
 *     DTOs are strict, so a payload carrying it is refused, and this service
 *     sets `GENERIC` on every create. No clinic-created type can publish a
 *     template version or feed the retrieval corpus.
 *   * **System rows are structurally immutable** (FR-E5-33), following the
 *     seeded-role rule in `rbac.service.ts`: `code` and `behavior` are owned
 *     by `seed.sql` because handlers key on them, and the row cannot be
 *     deleted. Everything a clinic wants to change — name, description,
 *     approval policy, party flags, ordering — stays editable.
 *
 * The approval policy is audited on every change and self-approval gets its
 * own verb when it flips on (NFR-AUD-03): it is the one setting that lets a
 * drafter approve their own work (FR-E5-14).
 */
@Injectable()
export class DocumentTypeService {
  constructor(
    private readonly documentTypeRepository: DocumentTypeRepository,
    private readonly auditService: AuditService,
  ) {}

  async listTypes(query: ListDocumentTypesQueryInput): Promise<DocumentTypeView[]> {
    const records = await this.documentTypeRepository.listTypes({
      includeInactive: query.includeInactive ?? false,
    });
    return records.map(toDocumentTypeView);
  }

  async getType(id: string): Promise<DocumentTypeView> {
    return toDocumentTypeView(await this.findTypeOrThrow(id));
  }

  /**
   * The type a new document is drafted against (`P16-T28`): live and active.
   * A deactivated type has left the picker (FR-E5-36); asking for it by id is
   * answered the same way as asking for one that never existed.
   */
  async findActiveTypeOrThrow(id: string): Promise<DocumentTypeRecord> {
    const record = await this.findTypeOrThrow(id);
    if (!record.isActive) {
      throw new NotFoundException('Document type not found');
    }
    return record;
  }

  async createType(input: CreateDocumentTypeInput, actor: CurrentUser): Promise<DocumentTypeView> {
    const takenCodes = new Set(await this.documentTypeRepository.listAllCodes());
    const record = await this.documentTypeRepository.createType({
      code: generateDocumentTypeCode(input.name, takenCodes),
      name: input.name,
      description: input.description ?? null,
      // The one line that makes dynamic types safe (FR-E5-32): whatever the
      // request said — and the strict DTO has already refused it saying
      // anything — a clinic-created type does nothing on issue.
      behavior: DEFAULT_DOCUMENT_TYPE_BEHAVIOR,
      isApprovalRequired: input.isApprovalRequired,
      allowSelfApproval: input.allowSelfApproval,
      requiredApprovals: input.requiredApprovals,
      requiresPatient: input.requiresPatient,
      requiresDoctor: input.requiresDoctor,
      contentMode: input.contentMode,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { code: record.code, behavior: record.behavior },
    });
    await this.auditPolicy(record.id, actor, null, record);
    return toDocumentTypeView(record);
  }

  async updateType(
    id: string,
    input: UpdateDocumentTypeInput,
    actor: CurrentUser,
  ): Promise<DocumentTypeView> {
    const existing = await this.findTypeOrThrow(id);
    if (existing.isSystem && input.code !== undefined) {
      throw new ForbiddenException({
        message: 'The code of a system document type cannot be changed',
        code: DOCUMENT_TYPE_SYSTEM_ROW_ERROR_CODE,
      });
    }
    const record = await this.applyUpdate(existing, input);
    await this.auditService.record({
      action: AuditAction.UPDATE,
      resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      metadata: { changedFields: listChangedFields(input) },
    });
    await this.auditPolicy(id, actor, existing, record);
    return toDocumentTypeView(record);
  }

  /**
   * Soft delete, refused for a system row and for a type in use (FR-E5-36):
   * documents never lose their type, so the answer to "delete this" while
   * anything points at it is "deactivate it instead", and the response says
   * so with the count.
   */
  async deleteType(id: string, actor: CurrentUser): Promise<DeletedDocumentTypeView> {
    const existing = await this.findTypeOrThrow(id);
    if (existing.isSystem) {
      throw new ForbiddenException({
        message: 'A system document type cannot be deleted — deactivate it instead',
        code: DOCUMENT_TYPE_SYSTEM_ROW_ERROR_CODE,
      });
    }
    if (existing.documentCount > 0) {
      throw new ConflictException({
        message: `${existing.documentCount} document(s) use this type — deactivate it instead of deleting it`,
        code: DOCUMENT_TYPE_IN_USE_ERROR_CODE,
        errors: { documentCount: existing.documentCount },
      });
    }
    const deletedAt = new Date();
    await this.documentTypeRepository.softDeleteType(id, deletedAt);
    await this.auditService.record({
      action: AuditAction.DELETE,
      resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      metadata: { code: existing.code },
    });
    return { id, deletedAt: deletedAt.toISOString() };
  }

  /**
   * Replaces the default approver set (FR-E5-38). Every id must be a live
   * staff account — a patient can never be named (§7.5.4) — and the refusal
   * lists exactly which ids failed, so a picker can drop them.
   */
  async setDefaultApprovers(
    id: string,
    input: SetDocumentTypeDefaultApproversInput,
    actor: CurrentUser,
  ): Promise<DocumentTypeView> {
    await this.findTypeOrThrow(id);
    const invalidApproverIds = await this.findInvalidApproverIds(input.approverIds);
    if (invalidApproverIds.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Every default approver must be an active staff account',
        code: DOCUMENT_TYPE_APPROVER_INVALID_ERROR_CODE,
        errors: { approverIds: invalidApproverIds },
      });
    }
    await this.documentTypeRepository.replaceDefaultApprovers(id, input.approverIds);
    await this.auditService.record({
      action: AuditAction.UPDATE,
      resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      metadata: { event: 'DEFAULT_APPROVERS_CHANGED', approverIds: [...input.approverIds] },
    });
    return toDocumentTypeView(await this.findTypeOrThrow(id));
  }

  private async applyUpdate(
    existing: DocumentTypeRecord,
    input: UpdateDocumentTypeInput,
  ): Promise<DocumentTypeRecord> {
    try {
      return await this.documentTypeRepository.updateType({
        id: existing.id,
        code: input.code,
        name: input.name,
        description: input.description,
        isApprovalRequired: input.isApprovalRequired,
        allowSelfApproval: input.allowSelfApproval,
        requiredApprovals: input.requiredApprovals,
        requiresPatient: input.requiresPatient,
        requiresDoctor: input.requiresDoctor,
        contentMode: input.contentMode,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException({
          message: 'Another document type already uses this code',
          code: DOCUMENT_TYPE_CODE_TAKEN_ERROR_CODE,
          errors: { code: input.code },
        });
      }
      throw err;
    }
  }

  private async findInvalidApproverIds(approverIds: readonly string[]): Promise<string[]> {
    const candidates = await this.documentTypeRepository.findApproverCandidates(approverIds);
    const staffIds = new Set(
      candidates.filter((candidate) => !candidate.isPatient).map((candidate) => candidate.id),
    );
    return approverIds.filter((approverId) => !staffIds.has(approverId));
  }

  /**
   * NFR-AUD-03. One row whenever any policy field changed (with the before
   * and after, since the question afterwards is "what did it used to be"),
   * and a second, sharper row when self-approval came on. On create,
   * `before` is null and a non-default policy still counts as a change — a
   * type born with self-approval on is exactly the row an investigator wants
   * to find.
   */
  private async auditPolicy(
    typeId: string,
    actor: CurrentUser,
    before: DocumentTypeApprovalPolicy | null,
    after: DocumentTypeApprovalPolicy,
  ): Promise<void> {
    const previous = before ?? DEFAULT_APPROVAL_POLICY;
    const changedFields = APPROVAL_POLICY_FIELDS.filter(
      (field) => previous[field] !== after[field],
    );
    if (changedFields.length === 0) {
      return;
    }
    await this.auditService.record({
      action: AuditAction.APPROVAL_POLICY_CHANGED,
      resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
      resourceId: typeId,
      actorUserId: actor.sub,
      metadata: {
        changedFields,
        before: pickPolicy(previous),
        after: pickPolicy(after),
      },
    });
    if (!previous.allowSelfApproval && after.allowSelfApproval) {
      await this.auditService.record({
        action: AuditAction.SELF_APPROVAL_ENABLED,
        resource: DOCUMENT_TYPE_AUDIT_RESOURCE,
        resourceId: typeId,
        actorUserId: actor.sub,
      });
    }
  }

  /**
   * One type row by id, or 404. Public since `P16-T29`: the registry detail
   * and the approval workspace both need the type's approval policy and its
   * default approvers, and a second copy of that lookup would be a second
   * thing that could disagree with this one about a deactivated row.
   */
  async findTypeOrThrow(id: string): Promise<DocumentTypeRecord> {
    const record = await this.documentTypeRepository.findById(id);
    if (record === null) {
      throw new NotFoundException('Document type not found');
    }
    return record;
  }

  /**
   * The system type a behaviour is bound to, by `code` (`P16-T32`/`P16-T33`).
   *
   * Resolved by code and never by name: the seed owns `code` and `behavior`
   * and leaves the name to the clinic (FR-E5-33), so a clinic that renamed
   * "Templat faktur" must not thereby switch off its own publish gate. Null
   * rather than a throw when the row is missing — a seed that has not run yet
   * means no policy, which is the same answer as a policy that is off, and
   * failing the caller would take invoicing down over master data.
   */
  async findTypeByCode(code: string): Promise<DocumentTypeRecord | null> {
    return this.documentTypeRepository.findByCode(code);
  }
}

const DEFAULT_APPROVAL_POLICY: DocumentTypeApprovalPolicy = {
  isApprovalRequired: false,
  allowSelfApproval: false,
  requiredApprovals: 1,
};

function pickPolicy(policy: DocumentTypeApprovalPolicy): DocumentTypeApprovalPolicy {
  return {
    isApprovalRequired: policy.isApprovalRequired,
    allowSelfApproval: policy.allowSelfApproval,
    requiredApprovals: policy.requiredApprovals,
  };
}

/** Field names, never values: which fields an administrator touched is what an investigator asks first. */
function listChangedFields(input: UpdateDocumentTypeInput): string[] {
  return Object.keys(input)
    .filter((key) => input[key as keyof UpdateDocumentTypeInput] !== undefined)
    .sort();
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
  );
}
