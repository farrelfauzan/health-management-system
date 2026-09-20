import {
  SaveTaxCategoryDefaultsPayload,
  SaveTaxCodePayload,
  SaveTaxCodeRatePayload,
  TaxCategoryDefaultRecord,
  TaxCodeRateRecord,
  TaxCodeRecord,
  TaxCodeUsageRecord,
  UpdateTaxCodePayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, TaxCode, TaxCodeRate } from '../../../generated/prisma/client';
import { TaxCodeConflictError } from './tax-code-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';
const CALENDAR_DATE_LENGTH = 10;

const TAX_CODE_INCLUDE = {
  rates: { orderBy: { effectiveFrom: 'asc' } },
} as const satisfies Prisma.TaxCodeInclude;

/**
 * Persistence for tax codes, their rates and the category defaults (P27-T03).
 * Rates are only ever inserted: an edit to a past rate would change what an
 * already-issued invoice was taxed at.
 */
@Injectable()
export class TaxCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listTaxCodes(): Promise<TaxCodeRecord[]> {
    const rows = await this.prisma.taxCode.findMany({
      include: TAX_CODE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findTaxCodeById(id: string): Promise<TaxCodeRecord | null> {
    const row = await this.prisma.taxCode.findUnique({ where: { id }, include: TAX_CODE_INCLUDE });
    return row ? this.toRecord(row) : null;
  }

  async createTaxCode(payload: SaveTaxCodePayload): Promise<TaxCodeRecord> {
    const initialRate = payload.initialRate;
    try {
      const row = await this.prisma.taxCode.create({
        data: {
          code: payload.code,
          name: payload.name,
          ppnTreatment: payload.ppnTreatment,
          fakturTransactionCode: payload.fakturTransactionCode,
          invoiceNote: payload.invoiceNote,
          ...(initialRate
            ? {
                rates: {
                  create: this.toRateData({ ...initialRate, createdById: payload.createdById }),
                },
              }
            : {}),
        },
        include: TAX_CODE_INCLUDE,
      });
      return this.toRecord(row);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateTaxCode(id: string, payload: UpdateTaxCodePayload): Promise<TaxCodeRecord> {
    const row = await this.prisma.taxCode.update({
      where: { id },
      data: payload,
      include: TAX_CODE_INCLUDE,
    });
    return this.toRecord(row);
  }

  async createTaxCodeRate(payload: SaveTaxCodeRatePayload): Promise<TaxCodeRateRecord> {
    const row = await this.prisma.taxCodeRate.create({
      data: { taxCodeId: payload.taxCodeId, ...this.toRateData(payload) },
    });
    return this.toRateRecord(row);
  }

  /** Where each code is referenced: category defaults, and live tariffs and medications. */
  async listTaxCodeUsage(): Promise<TaxCodeUsageRecord[]> {
    const [defaults, tariffCounts, medicationCounts] = await Promise.all([
      this.prisma.taxCategoryDefault.findMany({ select: { target: true, taxCodeId: true } }),
      this.prisma.serviceTariff.groupBy({
        by: ['taxCodeId'],
        where: { taxCodeId: { not: null }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.medication.groupBy({
        by: ['taxCodeId'],
        where: { taxCodeId: { not: null }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const usage = new Map<string, TaxCodeUsageRecord>();
    function entryFor(taxCodeId: string): TaxCodeUsageRecord {
      const existing = usage.get(taxCodeId);
      if (existing) {
        return existing;
      }
      const created: TaxCodeUsageRecord = { taxCodeId, defaultTargets: [], overrideCount: 0 };
      usage.set(taxCodeId, created);
      return created;
    }
    defaults.forEach((row) => entryFor(row.taxCodeId).defaultTargets.push(row.target));
    [...tariffCounts, ...medicationCounts].forEach((row) => {
      if (row.taxCodeId !== null) {
        entryFor(row.taxCodeId).overrideCount += row._count._all;
      }
    });
    return [...usage.values()];
  }

  async listCategoryDefaults(): Promise<TaxCategoryDefaultRecord[]> {
    return this.prisma.taxCategoryDefault.findMany({
      select: { target: true, taxCodeId: true },
      orderBy: { target: 'asc' },
    });
  }

  /** One transaction: a `null` code removes the default, leaving the target unresolved. */
  async saveCategoryDefaults(payload: SaveTaxCategoryDefaultsPayload): Promise<void> {
    await this.prisma.$transaction(
      payload.defaults.map((entry) =>
        entry.taxCodeId === null
          ? this.prisma.taxCategoryDefault.deleteMany({ where: { target: entry.target } })
          : this.prisma.taxCategoryDefault.upsert({
              where: { target: entry.target },
              create: {
                target: entry.target,
                taxCodeId: entry.taxCodeId,
                updatedById: payload.updatedById,
              },
              update: { taxCodeId: entry.taxCodeId, updatedById: payload.updatedById },
            }),
      ),
    );
  }

  private toRateData(
    rate: Omit<SaveTaxCodeRatePayload, 'taxCodeId'>,
  ): Prisma.TaxCodeRateUncheckedCreateWithoutTaxCodeInput {
    return {
      ratePercent: rate.ratePercent,
      dppNumerator: rate.dppNumerator,
      dppDenominator: rate.dppDenominator,
      effectiveFrom: new Date(`${rate.effectiveFrom}T00:00:00.000Z`),
      createdById: rate.createdById,
    };
  }

  private toRecord(row: TaxCode & { rates: TaxCodeRate[] }): TaxCodeRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      ppnTreatment: row.ppnTreatment,
      fakturTransactionCode: row.fakturTransactionCode as TaxCodeRecord['fakturTransactionCode'],
      invoiceNote: row.invoiceNote,
      isSystem: row.isSystem,
      isActive: row.isActive,
      rates: row.rates.map((rate) => this.toRateRecord(rate)),
    };
  }

  private toRateRecord(row: TaxCodeRate): TaxCodeRateRecord {
    return {
      id: row.id,
      ratePercent: Number(row.ratePercent),
      dppNumerator: row.dppNumerator,
      dppDenominator: row.dppDenominator,
      // A DATE column comes back as UTC midnight; the calendar day is its prefix.
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, CALENDAR_DATE_LENGTH),
    };
  }

  private mapUniqueViolation(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION_CODE) {
      return new TaxCodeConflictError();
    }
    return err;
  }
}
