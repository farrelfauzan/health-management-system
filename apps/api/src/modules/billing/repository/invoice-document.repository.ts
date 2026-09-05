import { Injectable } from '@nestjs/common';

import {
  CompleteInvoiceDocumentRenderPayload,
  CreateInvoiceDocumentRecordPayload,
  InvoiceDeliverySubjectRecord,
  InvoiceDocumentRecord,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceRenderContextRecord,
  ResolvedInvoiceVariables,
  TemplateVariableWarning,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Invoice, InvoiceDocument, InvoiceItem, Prisma } from '../../../generated/prisma/client';

type UserDisplayRow = {
  email: string;
  doctorProfile: { fullName: string } | null;
} | null;

const RENDER_CONTEXT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  patient: {
    select: {
      fullName: true,
      mrn: true,
      dateOfBirth: true,
      sex: true,
      address: true,
      phoneNumber: true,
      // The only identifier column this query touches. The ciphertext is
      // never fetched — the render path holds no plaintext NIK at any point.
      nikLast4: true,
    },
  },
  encounter: {
    select: {
      startedAt: true,
      doctor: { select: { fullName: true, specialty: { select: { name: true } } } },
    },
  },
  admission: {
    select: {
      admittedAt: true,
      dischargedAt: true,
      bedAssignments: {
        orderBy: { startedAt: 'desc' as const },
        take: 1,
        select: { bed: { select: { code: true, room: { select: { name: true } } } } },
      },
    },
  },
  payment: {
    include: {
      cashier: { select: { email: true, doctorProfile: { select: { fullName: true } } } },
    },
  },
  voidedBy: { select: { email: true, doctorProfile: { select: { fullName: true } } } },
};

/**
 * Persistence for rendered invoice documents (`P16-T06`) and the one joined
 * read a render needs. Decimal columns surface as numbers and the Json
 * snapshot columns surface as their domain shapes — no Prisma type escapes
 * into the service.
 */
@Injectable()
export class InvoiceDocumentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findRenderContext(invoiceId: string): Promise<InvoiceRenderContextRecord | null> {
    const row = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: RENDER_CONTEXT_INCLUDE,
    });
    if (row === null) {
      return null;
    }
    const latestBedAssignment = row.admission?.bedAssignments[0];
    return {
      invoice: this.toInvoiceRecord(row),
      items: row.items.map((item) => this.toInvoiceItemRecord(item)),
      patient:
        row.patient === null
          ? null
          : {
              fullName: row.patient.fullName,
              mrn: row.patient.mrn,
              dateOfBirth: row.patient.dateOfBirth,
              sex: row.patient.sex,
              address: row.patient.address,
              phoneNumber: row.patient.phoneNumber,
              nikLast4: row.patient.nikLast4,
            },
      encounter:
        row.encounter === null
          ? null
          : {
              startedAt: row.encounter.startedAt,
              doctorName: row.encounter.doctor.fullName,
              specialtyName: row.encounter.doctor.specialty.name,
            },
      admission:
        row.admission === null
          ? null
          : {
              admittedAt: row.admission.admittedAt,
              dischargedAt: row.admission.dischargedAt,
              roomLabel:
                latestBedAssignment === undefined
                  ? null
                  : `${latestBedAssignment.bed.room.name} ${latestBedAssignment.bed.code}`,
            },
      payment:
        row.payment === null
          ? null
          : {
              method: row.payment.method,
              paidAt: row.payment.paidAt,
              referenceNumber: row.payment.referenceNumber,
              cashierName: this.toDisplayName(row.payment.cashier),
            },
      voidedByName: this.toDisplayName(row.voidedBy),
    };
  }

  async findLatestDocument(
    invoiceId: string,
    hasVoidWatermark: boolean,
  ): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findFirst({
      where: { invoiceId, hasVoidWatermark },
      orderBy: { createdAt: 'desc' },
    });
    return row === null ? null : this.toDocumentRecord(row);
  }

  async findDocumentForSlot(
    invoiceId: string,
    templateVersionId: string | null,
    hasVoidWatermark: boolean,
  ): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findFirst({
      where: { invoiceId, templateVersionId, hasVoidWatermark },
    });
    return row === null ? null : this.toDocumentRecord(row);
  }

  async createDocument(
    payload: CreateInvoiceDocumentRecordPayload,
  ): Promise<InvoiceDocumentRecord> {
    const row = await this.prismaService.invoiceDocument.create({
      data: {
        invoiceId: payload.invoiceId,
        templateVersionId: payload.templateVersionId,
        hasVoidWatermark: payload.hasVoidWatermark,
        wasBoundRetroactively: payload.wasBoundRetroactively,
        renderedData: payload.renderedData as unknown as Prisma.InputJsonValue,
        renderWarnings: payload.renderWarnings as unknown as Prisma.InputJsonValue,
      },
    });
    return this.toDocumentRecord(row);
  }

  /**
   * Marks a render complete unless another worker already did — the guard is
   * the `status <> READY` predicate, so the slower of two concurrent renders
   * changes nothing and can discard its own upload.
   */
  async completeRender(payload: CompleteInvoiceDocumentRenderPayload): Promise<boolean> {
    const result = await this.prismaService.invoiceDocument.updateMany({
      where: { id: payload.id, status: { not: 'READY' } },
      data: {
        status: 'READY',
        storageKey: payload.storageKey,
        checksum: payload.checksum,
        sizeBytes: payload.sizeBytes,
        pageCount: payload.pageCount,
        renderedAt: payload.renderedAt,
        renderError: null,
      },
    });
    return result.count === 1;
  }

  async failRender(id: string, renderError: string): Promise<boolean> {
    const result = await this.prismaService.invoiceDocument.updateMany({
      where: { id, status: { not: 'READY' } },
      data: { status: 'FAILED', renderError },
    });
    return result.count === 1;
  }

  /**
   * What a send needs to know (`P16-T25`): the bill, its latest live
   * snapshot — the un-watermarked slot, because a VOID invoice is never
   * deliverable and its watermarked render is never sent — and the patient
   * fields the delivery gate and the password resolver read. Nothing else:
   * the itemisation stays inside the PDF (FR-E4-15).
   */
  async findDeliverySubject(invoiceId: string): Promise<InvoiceDeliverySubjectRecord | null> {
    const row = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        patientId: true,
        totalAmount: true,
        issuedAt: true,
        patient: {
          select: {
            id: true,
            mrn: true,
            fullName: true,
            dateOfBirth: true,
            phoneNumber: true,
            email: true,
          },
        },
        documents: {
          where: { hasVoidWatermark: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, storageKey: true },
        },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      invoice: {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        patientId: row.patientId,
        totalAmount: row.totalAmount.toNumber(),
        issuedAt: row.issuedAt,
      },
      document: row.documents[0] ?? null,
      patient: row.patient,
    };
  }

  async findDocumentById(id: string): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findUnique({ where: { id } });
    return row === null ? null : this.toDocumentRecord(row);
  }

  private toDisplayName(user: UserDisplayRow): string | null {
    if (user === null) {
      return null;
    }
    return user.doctorProfile?.fullName ?? user.email;
  }

  private toDocumentRecord(row: InvoiceDocument): InvoiceDocumentRecord {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      templateVersionId: row.templateVersionId,
      hasVoidWatermark: row.hasVoidWatermark,
      wasBoundRetroactively: row.wasBoundRetroactively,
      renderedData: row.renderedData as unknown as ResolvedInvoiceVariables,
      status: row.status,
      storageKey: row.storageKey,
      checksum: row.checksum,
      sizeBytes: row.sizeBytes,
      pageCount: row.pageCount,
      renderWarnings: row.renderWarnings as unknown as TemplateVariableWarning[],
      renderError: row.renderError,
      renderedAt: row.renderedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toInvoiceRecord(row: Invoice): InvoiceRecord {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      encounterId: row.encounterId,
      admissionId: row.admissionId,
      patientId: row.patientId,
      status: row.status,
      totalAmount: Number(row.totalAmount),
      issuedAt: row.issuedAt,
      voidedAt: row.voidedAt,
      voidReason: row.voidReason,
      voidedById: row.voidedById,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toInvoiceItemRecord(row: InvoiceItem): InvoiceItemRecord {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      itemType: row.itemType,
      serviceTariffId: row.serviceTariffId,
      medicationId: row.medicationId,
      description: row.description,
      quantity: row.quantity,
      unitPrice: Number(row.unitPrice),
      amount: Number(row.amount),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
