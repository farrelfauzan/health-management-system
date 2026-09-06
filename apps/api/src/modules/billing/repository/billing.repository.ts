import {
  AddInvoiceItemRecordPayload,
  BillingDispensedItemRecord,
  BillingSourceEncounterRecord,
  CashierReportDayRange,
  CashierReportPaymentRecord,
  CreateInvoiceRecordPayload,
  InvoiceDetailRecord,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceWithRelationsRecord,
  ListInvoicesParams,
  PaymentRecord,
  RecordPaymentRecordPayload,
  RemoveInvoiceItemRecordPayload,
  VoidInvoiceRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { InvoiceNumberAllocatorRepository } from './invoice-number-allocator.repository';

const INVOICE_PATIENT_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  ownerUserId: true,
} satisfies Prisma.PatientProfileSelect;

const INVOICE_LIST_INCLUDE = {
  patient: { select: INVOICE_PATIENT_SELECT },
  _count: { select: { items: true } },
} satisfies Prisma.InvoiceInclude;

const INVOICE_DETAIL_INCLUDE = {
  patient: { select: INVOICE_PATIENT_SELECT },
  items: { orderBy: { createdAt: 'asc' } },
  payment: true,
} satisfies Prisma.InvoiceInclude;

type InvoiceRowBase = Omit<InvoiceRecord, 'totalAmount'> & { totalAmount: unknown };

type InvoiceItemRow = Omit<InvoiceItemRecord, 'unitPrice' | 'amount'> & {
  unitPrice: unknown;
  amount: unknown;
};

type PaymentRow = Omit<PaymentRecord, 'amount'> & { amount: unknown };

@Injectable()
export class BillingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceNumberAllocator: InvoiceNumberAllocatorRepository,
  ) {}

  async findEncounterForBilling(encounterId: string): Promise<BillingSourceEncounterRecord | null> {
    const encounter = await this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id: encounterId },
      select: {
        id: true,
        status: true,
        patientId: true,
        procedures: {
          where: { deletedAt: null },
          select: { id: true, code: true, display: true },
          orderBy: { performedAt: 'asc' as const },
        },
        immunizations: {
          where: { deletedAt: null },
          select: { id: true, medication: { select: { code: true, name: true } } },
          orderBy: { occurredAt: 'asc' as const },
        },
      },
    });
    if (!encounter) {
      return null;
    }
    return {
      ...encounter,
      immunizations: encounter.immunizations.map((immunization) => ({
        id: immunization.id,
        medicationCode: immunization.medication.code,
        medicationName: immunization.medication.name,
      })),
    };
  }

  /**
   * What actually crossed the pharmacy counter for this visit: items of
   * DISPENSED dispense records whose prescription belongs to the encounter.
   * The prescription itself is never billed — a partially dispensed
   * prescription must not charge for the undelivered rest.
   */
  async findDispensedItemsByEncounterId(
    encounterId: string,
  ): Promise<BillingDispensedItemRecord[]> {
    const rows = await this.prisma.dispenseItem.findMany({
      where: {
        dispenseRecord: {
          status: 'DISPENSED',
          prescription: { encounterId, deletedAt: null },
        },
      },
      select: {
        medicationId: true,
        quantity: true,
        medication: { select: { id: true, name: true, unitPrice: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      medicationId: row.medicationId,
      quantity: row.quantity,
      medication: {
        id: row.medication.id,
        name: row.medication.name,
        unitPrice: row.medication.unitPrice === null ? null : Number(row.medication.unitPrice),
      },
    }));
  }

  /** The partial unique index enforces this too; the query exists to answer 409 before it fires. */
  async findLiveInvoiceByEncounterId(encounterId: string): Promise<{ id: string } | null> {
    return this.prisma.invoice.findFirst({
      where: { encounterId, deletedAt: null, status: { not: 'VOID' } },
      select: { id: true },
    });
  }

  async findLiveInvoiceByAdmissionId(admissionId: string): Promise<{ id: string } | null> {
    return this.prisma.invoice.findFirst({
      where: { admissionId, deletedAt: null, status: { not: 'VOID' } },
      select: { id: true },
    });
  }

  /**
   * Invoice number allocation and the invoice insert share one transaction: a
   * failed insert rolls the counter back, so the number goes to the next
   * invoice instead of leaving a hole in the day's sequence.
   */
  async createInvoiceWithItems(payload: CreateInvoiceRecordPayload): Promise<InvoiceDetailRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const invoiceNumber = await this.invoiceNumberAllocator.allocateInvoiceNumber(
        tx,
        payload.invoiceDate,
      );
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          encounterId: payload.encounterId,
          admissionId: payload.admissionId,
          patientId: payload.patientId,
          createdById: payload.createdById,
          totalAmount: payload.totalAmount,
          items: {
            create: payload.items.map((item) => ({
              itemType: item.itemType,
              serviceTariffId: item.serviceTariffId,
              medicationId: item.medicationId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            })),
          },
        },
        include: INVOICE_DETAIL_INCLUDE,
      });
      return this.toInvoiceDetailRecord(created);
    });
  }

  async listInvoices(params: ListInvoicesParams): Promise<{
    items: InvoiceWithRelationsRecord[];
    page: number;
    limit: number;
    total: number;
  }> {
    const { page, limit, status, patientId, encounterId } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(encounterId ? { encounterId } : {}),
      ...(params.admissionId ? { admissionId: params.admissionId } : {}),
      ...this.buildCreatedAtFilter(params),
    };
    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const invoices = await this.prisma.findManyActive(tx.invoice, {
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' as const },
        include: INVOICE_LIST_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.invoice, { where });
      return [invoices, count] as const;
    });

    return {
      items: items.map((row) => this.toInvoiceWithRelationsRecord(row)),
      page,
      limit,
      total,
    };
  }

  async findInvoiceWithRelationsById(id: string): Promise<InvoiceWithRelationsRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.invoice, {
      where: { id },
      include: INVOICE_LIST_INCLUDE,
    });
    return row ? this.toInvoiceWithRelationsRecord(row) : null;
  }

  async findInvoiceDetailById(id: string): Promise<InvoiceDetailRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.invoice, {
      where: { id },
      include: INVOICE_DETAIL_INCLUDE,
    });
    return row ? this.toInvoiceDetailRecord(row) : null;
  }

  async issueInvoice(id: string, issuedAt: Date): Promise<InvoiceDetailRecord> {
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'ISSUED', issuedAt },
      include: INVOICE_DETAIL_INCLUDE,
    });
    return this.toInvoiceDetailRecord(updated);
  }

  /**
   * The payment insert and the PAID transition commit together: a payment row
   * against a non-PAID invoice and a PAID invoice with no payment are both
   * states the cashier report cannot explain.
   */
  async recordPayment(payload: RecordPaymentRecordPayload): Promise<InvoiceDetailRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: payload.invoiceId,
          method: payload.method,
          amount: payload.amount,
          referenceNumber: payload.referenceNumber,
          notes: payload.notes,
          paidAt: payload.paidAt,
          cashierId: payload.cashierId,
        },
      });
      const updated = await tx.invoice.update({
        where: { id: payload.invoiceId },
        data: { status: 'PAID' },
        include: INVOICE_DETAIL_INCLUDE,
      });
      return this.toInvoiceDetailRecord(updated);
    });
  }

  /**
   * A hand-added line and the total it changes commit together: the stored
   * total is what the cashier is asked to repeat on payment, so it can never
   * disagree with the lines beneath it.
   */
  async addInvoiceItem(payload: AddInvoiceItemRecordPayload): Promise<InvoiceDetailRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.invoiceItem.create({
        data: {
          invoiceId: payload.invoiceId,
          itemType: payload.item.itemType,
          serviceTariffId: payload.item.serviceTariffId,
          medicationId: payload.item.medicationId,
          description: payload.item.description,
          quantity: payload.item.quantity,
          unitPrice: payload.item.unitPrice,
          amount: payload.item.amount,
        },
      });
      return this.updateInvoiceTotalFromItems(tx, payload.invoiceId);
    });
  }

  async removeInvoiceItem(payload: RemoveInvoiceItemRecordPayload): Promise<InvoiceDetailRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.invoiceItem.delete({
        where: { id: payload.itemId, invoiceId: payload.invoiceId },
      });
      return this.updateInvoiceTotalFromItems(tx, payload.invoiceId);
    });
  }

  async voidInvoice(payload: VoidInvoiceRecordPayload): Promise<InvoiceDetailRecord> {
    const updated = await this.prisma.invoice.update({
      where: { id: payload.id },
      data: {
        status: 'VOID',
        voidedAt: payload.voidedAt,
        voidReason: payload.voidReason,
        voidedById: payload.voidedById,
      },
      include: INVOICE_DETAIL_INCLUDE,
    });
    return this.toInvoiceDetailRecord(updated);
  }

  /**
   * The day's settled payments with the doctor whose encounter produced each,
   * bounded by UTC instants the service derives from the clinic-local day.
   * Voided invoices never reach here: PAID is terminal, so a payment row's
   * invoice can not have been voided afterwards.
   */
  async findPaymentsForCashierReport(
    range: CashierReportDayRange,
  ): Promise<CashierReportPaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({
      where: {
        paidAt: { gte: range.startInclusive, lt: range.endExclusive },
      },
      select: {
        method: true,
        amount: true,
        invoice: {
          select: {
            encounter: { select: { doctor: { select: { id: true, fullName: true } } } },
          },
        },
      },
      orderBy: { paidAt: 'asc' },
    });
    return rows.map((row) => ({
      method: row.method,
      amount: Number(row.amount),
      doctor: row.invoice.encounter?.doctor ?? null,
    }));
  }

  private buildCreatedAtFilter(params: ListInvoicesParams) {
    const { createdFrom, createdTo } = params;
    if (!createdFrom && !createdTo) {
      return {};
    }
    return {
      createdAt: {
        ...(createdFrom ? { gte: createdFrom } : {}),
        ...(createdTo ? { lt: this.toExclusiveDayEnd(createdTo) } : {}),
      },
    };
  }

  /** `createdTo` names a whole clinic day, so the bound is the next midnight. */
  private async updateInvoiceTotalFromItems(
    tx: PrismaTransactionClient,
    invoiceId: string,
  ): Promise<InvoiceDetailRecord> {
    const aggregate = await tx.invoiceItem.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { totalAmount: aggregate._sum.amount ?? 0 },
      include: INVOICE_DETAIL_INCLUDE,
    });
    return this.toInvoiceDetailRecord(updated);
  }

  private toExclusiveDayEnd(createdTo: Date): Date {
    const exclusiveEnd = new Date(createdTo);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    return exclusiveEnd;
  }

  /**
   * Prisma returns the money columns as `Decimal`; the domain works in plain
   * numbers, so the conversion happens here at the persistence boundary and no
   * `Decimal` escapes the repository.
   */
  private toInvoiceRecord(row: InvoiceRowBase): InvoiceRecord {
    return { ...row, totalAmount: Number(row.totalAmount) };
  }

  private toInvoiceWithRelationsRecord(
    row: InvoiceRowBase & {
      patient: InvoiceWithRelationsRecord['patient'];
      _count: { items: number };
    },
  ): InvoiceWithRelationsRecord {
    const { patient, _count, ...invoice } = row;
    return { ...this.toInvoiceRecord(invoice), patient, _count };
  }

  private toInvoiceDetailRecord(
    row: InvoiceRowBase & {
      patient: InvoiceDetailRecord['patient'];
      items: InvoiceItemRow[];
      payment: PaymentRow | null;
    },
  ): InvoiceDetailRecord {
    const { patient, items, payment, ...invoice } = row;
    return {
      ...this.toInvoiceRecord(invoice),
      patient,
      items: items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      })),
      payment: payment ? { ...payment, amount: Number(payment.amount) } : null,
    };
  }
}
