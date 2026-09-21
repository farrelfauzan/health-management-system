import {
  ClinicianFeeAccrualRecord,
  ClinicianFeeClinicianRecord,
  ClinicianFeeInvoiceRecord,
  ClinicianFeePeriodTotalsRecord,
  ClinicianFeeStatementEntryRecord,
  CreateClinicianFeeEntryPayload,
  FindClinicianFeeStatementEntriesParams,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

/**
 * The jasa medis ledger (P27-T06). Writes happen inside the billing
 * transaction that settles or voids the invoice, so a payment never commits
 * without its entries. `(invoice_item_id, kind)` is unique and every insert
 * skips duplicates: replaying a payment or a void writes nothing twice.
 */
@Injectable()
export class ClinicianFeeEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The invoice's lines and the clinician they are attributed to: the
   * encounter's clinician, else the admitting doctor of the stay.
   */
  async findInvoiceForFees(
    tx: PrismaTransactionClient,
    invoiceId: string,
  ): Promise<ClinicianFeeInvoiceRecord | null> {
    const row = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        encounter: { select: { doctorId: true } },
        admission: { select: { admittingDoctorId: true } },
        items: {
          select: {
            id: true,
            itemType: true,
            serviceTariffId: true,
            serviceTariff: { select: { category: true } },
            quantity: true,
            amount: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) {
      return null;
    }
    return {
      invoiceId: row.id,
      doctorId: row.encounter?.doctorId ?? row.admission?.admittingDoctorId ?? null,
      lines: row.items.map((item) => ({
        invoiceItemId: item.id,
        itemType: item.itemType,
        serviceTariffId: item.serviceTariffId,
        tariffCategory: item.serviceTariff?.category ?? null,
        quantity: item.quantity,
        amount: Number(item.amount),
      })),
    };
  }

  async findAccrualsForInvoice(
    tx: PrismaTransactionClient,
    invoiceId: string,
  ): Promise<ClinicianFeeAccrualRecord[]> {
    const rows = await tx.clinicianFeeEntry.findMany({
      where: { invoiceId, kind: 'ACCRUAL' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      invoiceItemId: row.invoiceItemId,
      doctorId: row.doctorId,
      ruleId: row.ruleId,
      ruleMode: row.ruleMode,
      ruleValue: Number(row.ruleValue),
      lineAmount: Number(row.lineAmount),
      grossFee: Number(row.grossFee),
      clinicShare: Number(row.clinicShare),
    }));
  }

  /** Returns how many rows were actually inserted; duplicates are skipped. */
  async createEntries(
    tx: PrismaTransactionClient,
    entries: readonly CreateClinicianFeeEntryPayload[],
  ): Promise<number> {
    if (entries.length === 0) {
      return 0;
    }
    const result = await tx.clinicianFeeEntry.createMany({
      data: entries.map((entry) => ({ ...entry })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async sumPeriodByClinician(period: string): Promise<ClinicianFeePeriodTotalsRecord[]> {
    const groups = await this.prisma.clinicianFeeEntry.groupBy({
      by: ['doctorId'],
      where: { period },
      _count: { _all: true },
      _sum: { lineAmount: true, grossFee: true, clinicShare: true },
    });
    return groups.map((group) => ({
      doctorId: group.doctorId,
      entryCount: group._count._all,
      lineAmount: Number(group._sum.lineAmount ?? 0),
      grossFee: Number(group._sum.grossFee ?? 0),
      clinicShare: Number(group._sum.clinicShare ?? 0),
    }));
  }

  async findStatementEntries(
    params: FindClinicianFeeStatementEntriesParams,
  ): Promise<ClinicianFeeStatementEntryRecord[]> {
    const rows = await this.prisma.clinicianFeeEntry.findMany({
      where: { doctorId: params.doctorId, period: params.period },
      select: {
        id: true,
        kind: true,
        invoiceId: true,
        occurredAt: true,
        ruleMode: true,
        ruleValue: true,
        lineAmount: true,
        grossFee: true,
        clinicShare: true,
        invoice: { select: { invoiceNumber: true } },
        invoiceItem: { select: { description: true, itemType: true, quantity: true } },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoice.invoiceNumber,
      description: row.invoiceItem.description,
      itemType: row.invoiceItem.itemType,
      quantity: row.invoiceItem.quantity,
      occurredAt: row.occurredAt,
      ruleMode: row.ruleMode,
      ruleValue: Number(row.ruleValue),
      lineAmount: Number(row.lineAmount),
      grossFee: Number(row.grossFee),
      clinicShare: Number(row.clinicShare),
    }));
  }

  async findClinicians(doctorIds: readonly string[]): Promise<ClinicianFeeClinicianRecord[]> {
    if (doctorIds.length === 0) {
      return [];
    }
    return this.prisma.doctorProfile.findMany({
      where: { id: { in: [...doctorIds] } },
      select: { id: true, fullName: true, profession: true },
    });
  }
}
