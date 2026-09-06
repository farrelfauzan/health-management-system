import { Injectable } from '@nestjs/common';

import {
  CreateManagedDocumentRecordPayload,
  ListManagedDocumentsParams,
  ManagedDocumentAccessContext,
  ManagedDocumentHistoryEntryRecord,
  ManagedDocumentPage,
  ManagedDocumentRecord,
  UpdateManagedDocumentRecordPayload,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/** Store purposes a clinic-corpus reader may see through the registry (§7.5.3). */
const CLINIC_CORPUS_PURPOSES = ['FAQ_KNOWLEDGE_BASE', 'GENERAL'] as const;

/** Store purposes only their owner may see, whatever else the caller holds. */
const OWNER_ONLY_PURPOSES = ['PERSONAL_KNOWLEDGE_BASE', 'DOCTOR_VAULT'] as const;

const DOCUMENT_INCLUDE = {
  type: {
    select: {
      id: true,
      code: true,
      name: true,
      behavior: true,
      contentMode: true,
      requiresPatient: true,
      requiresDoctor: true,
      isActive: true,
    },
  },
  patient: { select: { id: true, fullName: true } },
  doctor: { select: { id: true, fullName: true } },
  draftedBy: { select: { id: true, email: true } },
  subjectDocument: { select: { purpose: true, ownerId: true } },
} satisfies Prisma.ManagedDocumentInclude;

type DocumentRow = Prisma.ManagedDocumentGetPayload<{ include: typeof DOCUMENT_INCLUDE }>;

/**
 * Persistence for the documents registry (`P16-T28`).
 *
 * Every read takes an {@link ManagedDocumentAccessContext} and folds it into
 * the `where` — the per-row source rule (FR-E5-04) is a predicate the
 * database evaluates, not a filter applied to a page after the fact, so the
 * count and the page agree and neither can leak a row the caller could not
 * open (FR-E5-03). {@link buildAccessWhere} is the whole rule; the service
 * reuses it for a single-row read so list and detail can never disagree.
 */
@Injectable()
export class ManagedDocumentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listDocuments(params: ListManagedDocumentsParams): Promise<ManagedDocumentPage> {
    const where = buildListWhere(params);
    const [rows, total] = await this.prismaService.executeTransaction(async (tx) => {
      const pageRows = await tx.managedDocument.findMany({
        where,
        include: DOCUMENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });
      return [pageRows, await tx.managedDocument.count({ where })];
    });
    return { items: rows.map(toRecord), total };
  }

  /** Every matching row, for the CSV export — capped by the caller. */
  async listDocumentsForExport(
    params: Omit<ListManagedDocumentsParams, 'page' | 'limit'>,
    maxRows: number,
  ): Promise<ManagedDocumentRecord[]> {
    const rows = await this.prismaService.managedDocument.findMany({
      where: buildListWhere({ ...params, page: 1, limit: maxRows }),
      include: DOCUMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: maxRows,
    });
    return rows.map(toRecord);
  }

  /**
   * One row the caller may see, or null. The access rule is in the `where`
   * on purpose: a row that exists but is outside the caller's reach is
   * indistinguishable from one that does not exist.
   */
  async findVisibleById(
    id: string,
    access: ManagedDocumentAccessContext,
  ): Promise<ManagedDocumentRecord | null> {
    const row = await this.prismaService.managedDocument.findFirst({
      where: { AND: [{ id, deletedAt: null }, buildAccessWhere(access)] },
      include: DOCUMENT_INCLUDE,
    });
    return row === null ? null : toRecord(row);
  }

  async createDocument(
    payload: CreateManagedDocumentRecordPayload,
  ): Promise<ManagedDocumentRecord> {
    const row = await this.prismaService.managedDocument.create({
      data: {
        typeId: payload.typeId,
        status: payload.status,
        title: payload.title,
        documentNumber: payload.documentNumber,
        contentHtml: payload.contentHtml,
        storageKey: payload.storageKey,
        storageMimeType: payload.storageMimeType,
        storageSizeBytes: payload.storageSizeBytes,
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        subjectTemplateId: payload.subjectTemplateId,
        subjectDocumentId: payload.subjectDocumentId,
        subjectInvoiceId: payload.subjectInvoiceId,
        draftedById: payload.draftedById,
        issuedAt: payload.issuedAt,
      },
      include: DOCUMENT_INCLUDE,
    });
    return toRecord(row);
  }

  async updateDocument(
    payload: UpdateManagedDocumentRecordPayload,
  ): Promise<ManagedDocumentRecord> {
    const row = await this.prismaService.managedDocument.update({
      where: { id: payload.id },
      data: {
        title: payload.title,
        documentNumber: payload.documentNumber,
        contentHtml: payload.contentHtml,
        storageKey: payload.storageKey,
        storageMimeType: payload.storageMimeType,
        storageSizeBytes: payload.storageSizeBytes,
        patientId: payload.patientId,
        doctorId: payload.doctorId,
      },
      include: DOCUMENT_INCLUDE,
    });
    return toRecord(row);
  }

  /**
   * The audit events recorded against one document, oldest first, with the
   * actor's email joined in (FR-E5-05). `audit_logs` has no relation to
   * `users` by design — a log row must outlive the account that wrote it —
   * so the join is a second query rather than an include.
   */
  async listHistory(documentId: string): Promise<ManagedDocumentHistoryEntryRecord[]> {
    const rows = await this.prismaService.auditLog.findMany({
      where: { resource: MANAGED_DOCUMENT_AUDIT_RESOURCE, resourceId: documentId },
      orderBy: { occurredAt: 'asc' },
      select: { id: true, action: true, actorUserId: true, metadata: true, occurredAt: true },
    });
    const actorIds = [
      ...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : []))),
    ];
    const actors = actorIds.length
      ? await this.prismaService.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actorUserId === null ? null : (actorById.get(row.actorUserId) ?? null),
      metadata: row.metadata,
      occurredAt: row.occurredAt,
    }));
  }

  async findPatientById(patientId: string): Promise<{ id: string } | null> {
    return this.prismaService.findFirstActive(this.prismaService.patientProfile, {
      where: { id: patientId },
      select: { id: true },
    });
  }

  async findDoctorById(doctorId: string): Promise<{ id: string } | null> {
    return this.prismaService.findFirstActive(this.prismaService.doctorProfile, {
      where: { id: doctorId, isActive: true },
      select: { id: true },
    });
  }
}

/**
 * FR-E5-04 as one predicate. A row with no subject is a plain clinic
 * document and needs only the registry read the guard already checked. A
 * row governing something else is visible on that thing's own terms: a
 * patient bill to an `invoice.read` holder, a template row to a template
 * reader, a corpus document to a corpus reader — and a vault or personal
 * knowledge-base document to its owner and nobody else, whatever else the
 * caller holds.
 */
export function buildAccessWhere(
  access: ManagedDocumentAccessContext,
): Prisma.ManagedDocumentWhereInput {
  const subjectDocumentBranches: Prisma.ManagedDocumentWhereInput[] = [
    { subjectDocumentId: null },
    { subjectDocument: { purpose: { in: [...OWNER_ONLY_PURPOSES] }, ownerId: access.userId } },
  ];
  if (access.canReadClinicCorpus) {
    subjectDocumentBranches.push({
      subjectDocument: { purpose: { in: [...CLINIC_CORPUS_PURPOSES] } },
    });
  }
  if (access.canReadPatientDocuments) {
    subjectDocumentBranches.push({ subjectDocument: { purpose: 'PATIENT_CLINICAL' } });
  }
  return {
    AND: [
      access.canReadInvoices ? {} : { subjectInvoiceId: null },
      access.canReadTemplates ? {} : { subjectTemplateId: null },
      { OR: subjectDocumentBranches },
    ],
  };
}

function buildListWhere(params: ListManagedDocumentsParams): Prisma.ManagedDocumentWhereInput {
  const conditions: Prisma.ManagedDocumentWhereInput[] = [
    { deletedAt: null },
    buildAccessWhere(params.access),
  ];
  if (params.typeId !== undefined) {
    conditions.push({ typeId: params.typeId });
  }
  if (params.status !== undefined) {
    conditions.push({ status: params.status });
  }
  if (params.draftedById !== undefined) {
    conditions.push({ draftedById: params.draftedById });
  }
  if (params.approverId !== undefined) {
    // Approval rounds arrive with P16-T29. Until then a filter on approver
    // matches nothing rather than everything, so a saved "awaiting me" view
    // never silently widens into the whole registry.
    conditions.push({ id: { in: [] } });
  }
  const dateWhere = buildDateWhere(params);
  if (dateWhere !== null) {
    conditions.push(dateWhere);
  }
  if (params.search !== undefined) {
    conditions.push(buildSearchWhere(params.search));
  }
  return { AND: conditions };
}

function buildDateWhere(
  params: ListManagedDocumentsParams,
): Prisma.ManagedDocumentWhereInput | null {
  if (params.from === undefined && params.to === undefined) {
    return null;
  }
  const range: Prisma.DateTimeFilter = {
    ...(params.from === undefined ? {} : { gte: params.from }),
    ...(params.to === undefined ? {} : { lte: params.to }),
  };
  return params.dateField === 'issued' ? { issuedAt: range } : { createdAt: range };
}

/** Title, document number and party names (FR-E5-03) — never content. */
function buildSearchWhere(search: string): Prisma.ManagedDocumentWhereInput {
  const contains = { contains: search, mode: 'insensitive' as const };
  return {
    OR: [
      { title: contains },
      { documentNumber: contains },
      { patient: { fullName: contains } },
      { doctor: { fullName: contains } },
    ],
  };
}

function toRecord(row: DocumentRow): ManagedDocumentRecord {
  return {
    id: row.id,
    typeId: row.typeId,
    type: row.type,
    status: row.status,
    title: row.title,
    documentNumber: row.documentNumber,
    contentHtml: row.contentHtml,
    storageKey: row.storageKey,
    storageMimeType: row.storageMimeType,
    storageSizeBytes: row.storageSizeBytes,
    patient: row.patient,
    doctor: row.doctor,
    subjectTemplateId: row.subjectTemplateId,
    subjectDocumentId: row.subjectDocumentId,
    subjectInvoiceId: row.subjectInvoiceId,
    subjectDocument: row.subjectDocument,
    draftedBy: row.draftedBy,
    issuedAt: row.issuedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
