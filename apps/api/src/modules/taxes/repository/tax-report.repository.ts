import {
  FinalizeTaxReportPayload,
  Pp55SourcePayment,
  PpnOutputSourceLine,
  resolveUserDisplayName,
  SaveTaxReportPayload,
  TaxReportActorNames,
  TaxReportKindValue,
  TaxReportLine,
  TaxReportPeriodRange,
  TaxReportRecord,
  TaxReportSummary,
  UpdateTaxReportComputationPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { USER_DISPLAY_NAME_SELECT } from '../../../common/prisma/user-display-name-select';
import { Prisma, TaxReportDraft } from '../../../generated/prisma/client';

const ACTOR_NAME_SELECT = {
  select: USER_DISPLAY_NAME_SELECT,
} as const;

/**
 * Persistence for the monthly tax report drafts, and the two reads they are
 * computed from (P27-T05): payments received in a period (PP 55 is cash
 * basis) and the tax snapshot on invoices issued in it (PPN keluaran). Both
 * reads are read-only reporting over billing's tables; nothing here writes
 * to them.
 */
@Injectable()
export class TaxReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPaymentsPaidBetween(range: TaxReportPeriodRange): Promise<Pp55SourcePayment[]> {
    const rows = await this.prisma.payment.findMany({
      where: { paidAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        paidAt: true,
        method: true,
        amount: true,
        invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { paidAt: 'asc' },
    });
    return rows.map((row) => ({
      paymentId: row.id,
      invoiceNumber: row.invoice.invoiceNumber,
      paidAt: row.paidAt,
      method: row.method,
      amount: Number(row.amount),
    }));
  }

  async sumPaymentsPaidBetween(range: TaxReportPeriodRange): Promise<number> {
    const aggregate = await this.prisma.payment.aggregate({
      where: { paidAt: { gte: range.start, lt: range.end } },
      _sum: { amount: true },
    });
    return Number(aggregate._sum.amount ?? 0);
  }

  async findIssuedInvoiceLinesBetween(range: TaxReportPeriodRange): Promise<PpnOutputSourceLine[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        issuedAt: { gte: range.start, lt: range.end },
        status: { not: 'VOID' },
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        issuedAt: true,
        items: {
          select: {
            taxCode: true,
            ppnTreatment: true,
            fakturTransactionCode: true,
            amount: true,
            taxableAmount: true,
            taxBase: true,
            taxAmount: true,
          },
        },
      },
      orderBy: { issuedAt: 'asc' },
    });
    return invoices.flatMap((invoice) =>
      invoice.items.map((item) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt ?? range.start,
        taxCode: item.taxCode,
        ppnTreatment: item.ppnTreatment,
        fakturTransactionCode: item.fakturTransactionCode,
        amount: Number(item.amount),
        taxableAmount: item.taxableAmount === null ? null : Number(item.taxableAmount),
        taxBase: item.taxBase === null ? null : Number(item.taxBase),
        taxAmount: Number(item.taxAmount),
      })),
    );
  }

  async listReportsForYear(year: number): Promise<TaxReportRecord[]> {
    const rows = await this.prisma.taxReportDraft.findMany({
      where: { period: { startsWith: `${year}-` } },
      orderBy: [{ period: 'asc' }, { kind: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findReportById(id: string): Promise<TaxReportRecord | null> {
    const row = await this.prisma.taxReportDraft.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }

  /**
   * Who drafted and who finalized the report, as the PDF footer names them
   * (P27-T12): the doctor profile's name when there is one, else the email —
   * the same rule the invoice footer uses.
   */
  async findReportActorNames(id: string): Promise<TaxReportActorNames> {
    const row = await this.prisma.taxReportDraft.findUnique({
      where: { id },
      select: { generatedBy: ACTOR_NAME_SELECT, finalizedBy: ACTOR_NAME_SELECT },
    });
    return {
      generatedByName: toActorName(row?.generatedBy ?? null),
      finalizedByName: toActorName(row?.finalizedBy ?? null),
    };
  }

  async findReportByPeriodAndKind(
    period: string,
    kind: TaxReportKindValue,
  ): Promise<TaxReportRecord | null> {
    const row = await this.prisma.taxReportDraft.findUnique({
      where: { period_kind: { period, kind } },
    });
    return row ? this.toRecord(row) : null;
  }

  async createReport(payload: SaveTaxReportPayload): Promise<TaxReportRecord> {
    const row = await this.prisma.taxReportDraft.create({
      data: {
        period: payload.period,
        kind: payload.kind,
        summary: toJson(payload.summary),
        lines: toJson(payload.lines),
        generatedAt: new Date(),
        generatedById: payload.generatedById,
      },
    });
    return this.toRecord(row);
  }

  /** Only a DRAFT is recomputed; the status filter makes a finalized row untouchable. */
  async updateReportComputation(
    payload: UpdateTaxReportComputationPayload,
  ): Promise<TaxReportRecord> {
    const row = await this.prisma.taxReportDraft.update({
      where: { id: payload.id, status: 'DRAFT' },
      data: {
        summary: toJson(payload.summary),
        lines: toJson(payload.lines),
        generatedAt: new Date(),
        generatedById: payload.generatedById,
      },
    });
    return this.toRecord(row);
  }

  /** Freezes the figures computed at the moment of finalizing, in the same write. */
  async finalizeReport(payload: FinalizeTaxReportPayload): Promise<TaxReportRecord> {
    const row = await this.prisma.taxReportDraft.update({
      where: { id: payload.id, status: 'DRAFT' },
      data: {
        status: 'FINALIZED',
        summary: toJson(payload.summary),
        lines: toJson(payload.lines),
        generatedAt: payload.finalizedAt,
        finalizedAt: payload.finalizedAt,
        finalizedById: payload.finalizedById,
      },
    });
    return this.toRecord(row);
  }

  private toRecord(row: TaxReportDraft): TaxReportRecord {
    return {
      id: row.id,
      period: row.period,
      kind: row.kind,
      status: row.status,
      summary: row.summary as unknown as TaxReportSummary,
      lines: row.lines as unknown as TaxReportLine[],
      generatedAt: row.generatedAt,
      generatedById: row.generatedById,
      finalizedAt: row.finalizedAt,
      finalizedById: row.finalizedById,
    };
  }
}

function toJson(value: TaxReportSummary | TaxReportLine[]): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toActorName(
  user: { email: string; fullName: string | null; doctorProfile: { fullName: string } | null } | null,
): string | null {
  return user === null ? null : resolveUserDisplayName(user);
}
