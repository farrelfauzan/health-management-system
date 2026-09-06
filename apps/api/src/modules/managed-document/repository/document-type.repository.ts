import { Injectable } from '@nestjs/common';

import {
  CreateDocumentTypeRecordPayload,
  DocumentTypeApproverCandidateRecord,
  DocumentTypeRecord,
  UpdateDocumentTypeRecordPayload,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const PATIENT_ROLE_CODE = 'PATIENT';

const TYPE_INCLUDE = {
  defaultApprovers: {
    orderBy: { approver: { email: 'asc' as const } },
    select: { approver: { select: { id: true, email: true } } },
  },
} satisfies Prisma.DocumentTypeInclude;

type TypeRow = Prisma.DocumentTypeGetPayload<{ include: typeof TYPE_INCLUDE }>;

/**
 * Persistence for document-type master data (`P16-T39`).
 *
 * `behavior` is written from the payload the service builds and never from a
 * request — the repository has no way to tell the difference, which is why
 * the service is the boundary. `documentCount` is the registry's foreign key
 * count; the registry table lands with `P16-T28`, and until it does every
 * type counts as unused (see {@link countDocumentsByType}).
 */
@Injectable()
export class DocumentTypeRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listTypes(params: { includeInactive: boolean }): Promise<DocumentTypeRecord[]> {
    const rows = await this.prismaService.documentType.findMany({
      where: { deletedAt: null, ...(params.includeInactive ? {} : { isActive: true }) },
      include: TYPE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = await this.countDocumentsByType(rows.map((row) => row.id));
    return rows.map((row) => toRecord(row, counts.get(row.id) ?? 0));
  }

  async findById(id: string): Promise<DocumentTypeRecord | null> {
    const row = await this.prismaService.documentType.findFirst({
      where: { id, deletedAt: null },
      include: TYPE_INCLUDE,
    });
    if (row === null) {
      return null;
    }
    const counts = await this.countDocumentsByType([row.id]);
    return toRecord(row, counts.get(row.id) ?? 0);
  }

  /** Every code in use, live or soft-deleted — a code is never reused. */
  async listAllCodes(): Promise<string[]> {
    const rows = await this.prismaService.documentType.findMany({ select: { code: true } });
    return rows.map((row) => row.code);
  }

  async createType(payload: CreateDocumentTypeRecordPayload): Promise<DocumentTypeRecord> {
    const row = await this.prismaService.documentType.create({
      data: {
        code: payload.code,
        name: payload.name,
        description: payload.description,
        behavior: payload.behavior,
        isApprovalRequired: payload.isApprovalRequired,
        allowSelfApproval: payload.allowSelfApproval,
        requiredApprovals: payload.requiredApprovals,
        requiresPatient: payload.requiresPatient,
        requiresDoctor: payload.requiresDoctor,
        contentMode: payload.contentMode,
        isActive: payload.isActive,
        sortOrder: payload.sortOrder,
      },
      include: TYPE_INCLUDE,
    });
    return toRecord(row, 0);
  }

  async updateType(payload: UpdateDocumentTypeRecordPayload): Promise<DocumentTypeRecord> {
    const row = await this.prismaService.documentType.update({
      where: { id: payload.id },
      data: {
        code: payload.code,
        name: payload.name,
        description: payload.description,
        isApprovalRequired: payload.isApprovalRequired,
        allowSelfApproval: payload.allowSelfApproval,
        requiredApprovals: payload.requiredApprovals,
        requiresPatient: payload.requiresPatient,
        requiresDoctor: payload.requiresDoctor,
        contentMode: payload.contentMode,
        isActive: payload.isActive,
        sortOrder: payload.sortOrder,
      },
      include: TYPE_INCLUDE,
    });
    const counts = await this.countDocumentsByType([row.id]);
    return toRecord(row, counts.get(row.id) ?? 0);
  }

  async softDeleteType(id: string, deletedAt: Date): Promise<void> {
    await this.prismaService.documentType.update({
      where: { id },
      data: { deletedAt, isActive: false },
    });
  }

  /** The whole default set in one transaction: a PUT replaces, never merges. */
  async replaceDefaultApprovers(typeId: string, approverIds: readonly string[]): Promise<void> {
    await this.prismaService.executeTransaction(async (tx) => {
      await tx.documentTypeApprover.deleteMany({ where: { typeId } });
      if (approverIds.length === 0) {
        return;
      }
      await tx.documentTypeApprover.createMany({
        data: approverIds.map((approverId) => ({ typeId, approverId })),
      });
    });
  }

  /**
   * Who the named ids actually are, for the staff-only rule (FR-E5-38 with
   * §7.5.4): a live, non-system account, and whether any of its roles is
   * PATIENT. A missing id is simply absent from the result.
   */
  async findApproverCandidates(
    approverIds: readonly string[],
  ): Promise<DocumentTypeApproverCandidateRecord[]> {
    if (approverIds.length === 0) {
      return [];
    }
    const rows = await this.prismaService.user.findMany({
      where: { id: { in: [...approverIds] }, isActive: true, isSystem: false, deletedAt: null },
      select: {
        id: true,
        email: true,
        roles: {
          where: { deletedAt: null, unassignedAt: null },
          select: { role: { select: { code: true } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      isPatient: row.roles.some((userRole) => userRole.role.code === PATIENT_ROLE_CODE),
    }));
  }

  /**
   * How many registry rows point at each type (FR-E5-39). The registry
   * (`ManagedDocument`) arrives with `P16-T28`, which replaces this body with
   * a grouped count over `managed_documents.type_id`; until then no document
   * can reference a type, so every count is zero by construction.
   */
  async countDocumentsByType(typeIds: readonly string[]): Promise<Map<string, number>> {
    return new Map(typeIds.map((typeId) => [typeId, 0]));
  }
}

function toRecord(row: TypeRow, documentCount: number): DocumentTypeRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    behavior: row.behavior,
    isSystem: row.isSystem,
    isApprovalRequired: row.isApprovalRequired,
    allowSelfApproval: row.allowSelfApproval,
    requiredApprovals: row.requiredApprovals,
    requiresPatient: row.requiresPatient,
    requiresDoctor: row.requiresDoctor,
    contentMode: row.contentMode,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    documentCount,
    defaultApprovers: row.defaultApprovers.map((entry) => entry.approver),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
