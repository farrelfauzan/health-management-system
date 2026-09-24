import { Injectable } from '@nestjs/common';

import {
  CompleteInvoiceDocumentRenderPayload,
  CreateInvoiceDocumentRecordPayload,
  formatPatientAddress,
  InvoiceDeliverySubjectRecord,
  InvoiceDocumentRecord,
  InvoiceDocumentSlot,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceRenderContextRecord,
  ResolvedInvoiceVariables,
  resolveUserDisplayName,
  TemplateVariableWarning,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { USER_DISPLAY_NAME_SELECT } from '../../../common/prisma/user-display-name-select';
import { Invoice, InvoiceDocument, InvoiceItem, Prisma } from '../../../generated/prisma/client';
import { resolveInvoiceDocumentSlot } from '../service/resolve-invoice-document-slot';

type UserDisplayRow = {
  email: string;
  fullName: string | null;
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
      // The structured address (P19-T10), resolved to names so the
      // `patient.address` token prints one full line rather than the street
      // alone. Names come from the region tables, never from the row.
      rtRw: true,
      postalCode: true,
      village: { select: { name: true } },
      district: { select: { name: true } },
      regency: { select: { name: true } },
      province: { select: { name: true } },
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
      cashier: { select: USER_DISPLAY_NAME_SELECT },
    },
  },
  voidedBy: { select: USER_DISPLAY_NAME_SELECT },
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
              address: formatPatientAddress({
                address: row.patient.address,
                rtRw: row.patient.rtRw,
                villageName: row.patient.village?.name,
                districtName: row.patient.district?.name,
                regencyName: row.patient.regency?.name,
                provinceName: row.patient.province?.name,
                postalCode: row.patient.postalCode,
              }),
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
    slot: InvoiceDocumentSlot,
  ): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findFirst({
      where: {
        invoiceId,
        hasVoidWatermark: slot.hasVoidWatermark,
        isPaidReceipt: slot.isPaidReceipt,
      },
      orderBy: { createdAt: 'desc' },
    });
    return row === null ? null : this.toDocumentRecord(row);
  }

  async findDocumentForSlot(
    invoiceId: string,
    templateVersionId: string | null,
    slot: InvoiceDocumentSlot,
  ): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findFirst({
      where: {
        invoiceId,
        templateVersionId,
        hasVoidWatermark: slot.hasVoidWatermark,
        isPaidReceipt: slot.isPaidReceipt,
      },
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
        isPaidReceipt: payload.isPaidReceipt,
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
   * What a send needs to know (`P16-T25`): the bill, the latest snapshot of
   * the slot its current state lives in — the paid receipt for a PAID
   * invoice, never the ISSUED snapshot that has no payment on it — and the
   * patient fields the delivery gate and the password resolver read. Nothing
   * else: the itemisation stays inside the PDF (FR-E4-15).
   */
  async findDeliverySubject(
    invoiceId: string,
    invoiceDocumentId: string | null = null,
  ): Promise<InvoiceDeliverySubjectRecord | null> {
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
          // The worker asks for the snapshot the request pinned; the request
          // itself asks for the latest one of the current slot, picked below
          // because the slot depends on the invoice status this read returns.
          where: invoiceDocumentId === null ? {} : { id: invoiceDocumentId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            storageKey: true,
            hasVoidWatermark: true,
            isPaidReceipt: true,
          },
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
      document: this.pickDeliveryDocument(row.status, row.documents, invoiceDocumentId),
      patient: row.patient,
    };
  }

  async findDocumentById(id: string): Promise<InvoiceDocumentRecord | null> {
    const row = await this.prismaService.invoiceDocument.findUnique({ where: { id } });
    return row === null ? null : this.toDocumentRecord(row);
  }

  private pickDeliveryDocument(
    invoiceStatus: InvoiceRecord['status'],
    documents: ReadonlyArray<
      Pick<InvoiceDocument, 'id' | 'status' | 'storageKey' | 'hasVoidWatermark' | 'isPaidReceipt'>
    >,
    invoiceDocumentId: string | null,
  ): InvoiceDeliverySubjectRecord['document'] {
    const slot = resolveInvoiceDocumentSlot(invoiceStatus);
    const picked =
      invoiceDocumentId === null
        ? documents.find(
            (document) =>
              document.hasVoidWatermark === slot.hasVoidWatermark &&
              document.isPaidReceipt === slot.isPaidReceipt,
          )
        : documents[0];
    if (picked === undefined) {
      return null;
    }
    return { id: picked.id, status: picked.status, storageKey: picked.storageKey };
  }

  private toDisplayName(user: UserDisplayRow): string | null {
    if (user === null) {
      return null;
    }
    return resolveUserDisplayName(user);
  }

  private toDocumentRecord(row: InvoiceDocument): InvoiceDocumentRecord {
    return {
      id: row.id,
      invoiceId: row.invoiceId,
      templateVersionId: row.templateVersionId,
      hasVoidWatermark: row.hasVoidWatermark,
      isPaidReceipt: row.isPaidReceipt,
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
      taxAmount: Number(row.taxAmount),
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
      labOrderId: row.labOrderId,
      prescriptionItemId: row.prescriptionItemId,
      description: row.description,
      quantity: row.quantity,
      unitPrice: Number(row.unitPrice),
      amount: Number(row.amount),
      taxCode: row.taxCode,
      ppnTreatment: row.ppnTreatment,
      fakturTransactionCode: row.fakturTransactionCode,
      taxableAmount: row.taxableAmount === null ? null : Number(row.taxableAmount),
      taxBase: row.taxBase === null ? null : Number(row.taxBase),
      taxRatePercent: row.taxRatePercent === null ? null : Number(row.taxRatePercent),
      taxAmount: Number(row.taxAmount),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
