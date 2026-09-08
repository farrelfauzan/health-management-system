import {
  AddInvoiceItemRecordPayload,
  BillingDispensedItemRecord,
  BillingClinicalRequestRecord,
  BillingLabItemRecord,
  BillingSourceEncounterRecord,
  BillingSourceVisitRecord,
  CashierReportDayRange,
  CashierReportItemRecord,
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
import { Decimal } from '../../../generated/prisma/internal/prismaNamespace';
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
        registrationId: true,
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
        prescriptionItemId: true,
        quantity: true,
        medication: { select: { id: true, name: true, unitPrice: true } },
        prescriptionItem: {
          select: {
            id: true,
            compoundName: true,
            components: {
              select: {
                quantity: true,
                medication: { select: { id: true, name: true, unitPrice: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) =>
      row.medication
        ? {
            medicationId: row.medication.id,
            prescriptionItemId: row.prescriptionItemId,
            quantity: row.quantity,
            medication: {
              id: row.medication.id,
              name: row.medication.name,
              unitPrice:
                row.medication.unitPrice === null ? null : Number(row.medication.unitPrice),
            },
            compound: null,
          }
        : {
            medicationId: null,
            prescriptionItemId: row.prescriptionItemId,
            quantity: row.quantity,
            medication: null,
            // A compound is priced from its ingredients plus a compounding
            // fee (P10-T18): there is no single catalog price to read, and a
            // clinic that sold a puyer sold labour as well as substance.
            compound: {
              prescriptionItemId: row.prescriptionItem?.id ?? '',
              name: row.prescriptionItem?.compoundName ?? '',
              components: (row.prescriptionItem?.components ?? []).map((component) => ({
                medicationId: component.medication.id,
                name: component.medication.name,
                quantityPerCompound: Number(component.quantity),
                unitPrice:
                  component.medication.unitPrice === null
                    ? null
                    : Number(component.medication.unitPrice),
              })),
            },
          },
    );
  }

  /** The partial unique index enforces this too; the query exists to answer 409 before it fires. */
  async findLiveInvoiceByEncounterId(encounterId: string): Promise<{ id: string } | null> {
    return this.prisma.invoice.findFirst({
      where: { encounterId, deletedAt: null, status: { not: 'VOID' } },
      select: { id: true },
    });
  }

  /** The walk-in visit's live bill, if it already has one (P18-T10). */
  async findLiveInvoiceByRegistrationId(registrationId: string): Promise<{ id: string } | null> {
    return this.prisma.invoice.findFirst({
      where: { registrationId, deletedAt: null, status: { not: 'VOID' } },
      select: { id: true },
    });
  }

  /**
   * The visit itself, for a bill that has no encounter behind it (P18-T10).
   * Read rather than trusted from the caller so the invoice can never name a
   * patient the registration does not.
   */
  async findVisitForBilling(registrationId: string): Promise<BillingSourceVisitRecord | null> {
    const registration = await this.prisma.findFirstActive(this.prisma.registration, {
      where: { id: registrationId },
      select: { id: true, patientId: true, type: true, status: true },
    });
    return registration ?? null;
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
          registrationId: payload.registrationId,
          patientId: payload.patientId,
          createdById: payload.createdById,
          totalAmount: payload.totalAmount,
          items: {
            create: payload.items.map((item) => ({
              itemType: item.itemType,
              serviceTariffId: item.serviceTariffId,
              medicationId: item.medicationId,
              labOrderId: item.labOrderId,
              prescriptionItemId: item.prescriptionItemId,
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

  /**
   * The lab work this visit is billed for (P18-T06). Cancelled orders and
   * cancelled items are excluded — a withdrawn test was never run and is never
   * charged — and both tariffs come back on every row so the service can price
   * a panel once and a loose test on its own without a second query.
   */
  /**
   * The tests billable for one visit. Keyed on the registration rather than the
   * encounter (P18-T10) because that is the key every order has: a consultation
   * visit maps one-to-one to its encounter, and a walk-in has no encounter at
   * all.
   */
  async findLabItemsForBilling(registrationId: string): Promise<BillingLabItemRecord[]> {
    const rows = await this.prisma.labOrderItem.findMany({
      where: {
        status: { not: 'CANCELLED' },
        labOrder: { registrationId, status: { not: 'CANCELLED' } },
      },
      select: {
        labTestId: true,
        panelId: true,
        labOrder: { select: { id: true, orderNumber: true, chargeMode: true } },
        labTest: {
          select: {
            code: true,
            name: true,
            serviceTariffId: true,
            serviceTariff: { select: { price: true, isActive: true } },
          },
        },
        panel: {
          select: {
            name: true,
            serviceTariffId: true,
            serviceTariff: { select: { price: true, isActive: true } },
          },
        },
      },
      orderBy: [{ labOrderId: 'asc' }, { panelId: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      labOrderId: row.labOrder.id,
      orderNumber: row.labOrder.orderNumber,
      chargeMode: row.labOrder.chargeMode,
      labTestId: row.labTestId,
      testCode: row.labTest.code,
      testName: row.labTest.name,
      testTariffId: row.labTest.serviceTariffId,
      testPrice: toActiveTariffPrice(row.labTest.serviceTariff),
      panelId: row.panelId,
      panelName: row.panel?.name ?? null,
      panelTariffId: row.panel?.serviceTariffId ?? null,
      panelPrice: toActiveTariffPrice(row.panel?.serviceTariff ?? null),
    }));
  }

  /**
   * Every lab order and prescription raised on this visit, whatever their
   * disposition (P18-T11). Cancelled ones are excluded — a withdrawn request is
   * not something the cashier has to explain — but everything else comes back,
   * including work sent outside, because "why is there no lab line on this
   * bill" is exactly the question this answers.
   */
  async findClinicalRequestsForEncounter(
    encounterId: string,
  ): Promise<BillingClinicalRequestRecord[]> {
    const [labOrders, prescriptions] = await Promise.all([
      this.prisma.labOrder.findMany({
        where: { encounterId, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          orderNumber: true,
          chargeMode: true,
          externalFacilityName: true,
          _count: { select: { items: true } },
        },
        orderBy: { orderedAt: 'asc' },
      }),
      this.prisma.prescription.findMany({
        where: { encounterId, deletedAt: null, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          chargeMode: true,
          externalFacilityName: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return [
      ...labOrders.map((order) => ({
        kind: 'LAB_ORDER' as const,
        id: order.id,
        reference: order.orderNumber,
        description: `${order._count.items} laboratory ${order._count.items === 1 ? 'test' : 'tests'}`,
        chargeMode: order.chargeMode,
        externalFacilityName: order.externalFacilityName,
      })),
      ...prescriptions.map((prescription) => ({
        kind: 'PRESCRIPTION' as const,
        id: prescription.id,
        reference: null,
        description: `${prescription._count.items} prescribed ${prescription._count.items === 1 ? 'item' : 'items'}`,
        chargeMode: prescription.chargeMode,
        externalFacilityName: prescription.externalFacilityName,
      })),
    ];
  }

  /**
   * Every line of the invoices settled in the window, for the day's revenue
   * composition. Voided invoices cannot carry a payment, so filtering on the
   * payment is enough.
   */
  async findItemsForCashierReport(
    range: CashierReportDayRange,
  ): Promise<CashierReportItemRecord[]> {
    const rows = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          payment: { paidAt: { gte: range.startInclusive, lt: range.endExclusive } },
        },
      },
      select: { itemType: true, amount: true },
    });
    return rows.map((row) => ({ itemType: row.itemType, amount: Number(row.amount) }));
  }

  /**
   * Whether a live invoice for this encounter has left DRAFT. VOID is excluded
   * by `canTransitionInvoiceStatus`'s own rule — a voided bill charges nobody —
   * and the partial unique index means at most one live invoice exists anyway.
   */
  /** Keyed on the visit, so it answers for a walk-in too (P18-T10). */
  async hasIssuedInvoiceForVisit(registrationId: string): Promise<boolean> {
    const existing = await this.prisma.invoice.findFirst({
      where: {
        status: { in: ['ISSUED', 'PAID'] },
        deletedAt: null,
        OR: [{ registrationId }, { encounter: { registrationId } }],
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Which of these encounters already have a PAID invoice (P18-T06). One query
   * for the whole worklist rather than one per row, and a set rather than rows
   * because the only question asked of it is membership.
   */
  /**
   * Which of these visits have been paid for. Keyed on the registration rather
   * than the encounter (P18-T10) because that is the key every lab order has,
   * and it has to match a bill written either way: a consultation visit's
   * invoice names its encounter, a walk-in's names the registration directly.
   */
  async findVisitIdsWithSettledInvoice(
    registrationIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const ids = [...registrationIds];
    const rows = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
        deletedAt: null,
        OR: [{ registrationId: { in: ids } }, { encounter: { registrationId: { in: ids } } }],
      },
      select: { registrationId: true, encounter: { select: { registrationId: true } } },
    });
    return new Set(
      rows
        .map((row) => row.registrationId ?? row.encounter?.registrationId ?? null)
        .filter((registrationId): registrationId is string => registrationId !== null),
    );
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

/** A deactivated tariff is not a price. Treated as no price at all, which makes it a gap. */
function toActiveTariffPrice(tariff: { price: Decimal; isActive: boolean } | null): number | null {
  return tariff && tariff.isActive ? Number(tariff.price) : null;
}
