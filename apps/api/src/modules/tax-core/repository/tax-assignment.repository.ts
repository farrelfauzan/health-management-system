import {
  BulkAssignCoretaxCodesPayload,
  BulkAssignTaxCodePayload,
  FindTaxCodeOverridesParams,
  TaxAssignmentKindValue,
  TaxAssignmentTargetRecord,
  TaxCodeOverrides,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The tax side of tariffs and medications (P27-T03). Reads only what the
 * assignment screen shows and writes only `tax_code_id`: every other column of
 * those rows belongs to billing and pharmacy, and this repository never
 * touches them. Deleted rows are invisible; deactivated ones are listed only
 * when asked, because a retired tariff taxes nothing.
 */
@Injectable()
export class TaxAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveAssignmentTargets(): Promise<TaxAssignmentTargetRecord[]> {
    const [tariffs, medications] = await Promise.all([
      this.prisma.serviceTariff.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          price: true,
          taxCodeId: true,
          coretaxItemCode: true,
          coretaxUnitCode: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.medication.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          unitPrice: true,
          taxCodeId: true,
          coretaxItemCode: true,
          coretaxUnitCode: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return [
      ...tariffs.map((row) => ({
        kind: 'SERVICE_TARIFF' as const,
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        price: Number(row.price),
        taxCodeId: row.taxCodeId,
        coretaxItemCode: row.coretaxItemCode,
        coretaxUnitCode: row.coretaxUnitCode,
      })),
      ...medications.map((row) => ({
        kind: 'MEDICATION' as const,
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        price: row.unitPrice === null ? null : Number(row.unitPrice),
        taxCodeId: row.taxCodeId,
        coretaxItemCode: row.coretaxItemCode,
        coretaxUnitCode: row.coretaxUnitCode,
      })),
    ];
  }

  /**
   * The named tariffs or medicines, deactivated ones included — an
   * administrator browsing the price list sees those too (P27-T04).
   */
  async findAssignmentTargets(
    kind: TaxAssignmentKindValue,
    ids: string[],
  ): Promise<TaxAssignmentTargetRecord[]> {
    if (kind === 'SERVICE_TARIFF') {
      const rows = await this.prisma.serviceTariff.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          price: true,
          taxCodeId: true,
          coretaxItemCode: true,
          coretaxUnitCode: true,
        },
      });
      return rows.map((row) => ({ kind, ...row, price: Number(row.price) }));
    }
    const rows = await this.prisma.medication.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        unitPrice: true,
        taxCodeId: true,
        coretaxItemCode: true,
        coretaxUnitCode: true,
      },
    });
    return rows.map(({ unitPrice, ...row }) => ({
      kind,
      ...row,
      price: unitPrice === null ? null : Number(unitPrice),
    }));
  }

  /** The ids of one kind that exist and are not deleted. */
  async findExistingTargetIds(kind: TaxAssignmentKindValue, ids: string[]): Promise<string[]> {
    const where = { id: { in: ids }, deletedAt: null };
    const rows =
      kind === 'SERVICE_TARIFF'
        ? await this.prisma.serviceTariff.findMany({ where, select: { id: true } })
        : await this.prisma.medication.findMany({ where, select: { id: true } });
    return rows.map((row) => row.id);
  }

  /**
   * The code each named tariff and medication carries of its own, for taxing
   * invoice lines (P27-T04). Items without an override are simply absent, and
   * a deleted row still answers — an invoice line may outlive its tariff.
   */
  async findTaxCodeOverrides(params: FindTaxCodeOverridesParams): Promise<TaxCodeOverrides> {
    const [tariffs, medications] = await Promise.all([
      params.serviceTariffIds.length === 0
        ? []
        : this.prisma.serviceTariff.findMany({
            where: { id: { in: params.serviceTariffIds }, taxCodeId: { not: null } },
            select: { id: true, taxCodeId: true },
          }),
      params.medicationIds.length === 0
        ? []
        : this.prisma.medication.findMany({
            where: { id: { in: params.medicationIds }, taxCodeId: { not: null } },
            select: { id: true, taxCodeId: true },
          }),
    ]);
    const toMap = (rows: Array<{ id: string; taxCodeId: string | null }>): Map<string, string> =>
      new Map(rows.flatMap((row) => (row.taxCodeId ? [[row.id, row.taxCodeId] as const] : [])));
    return { byServiceTariffId: toMap(tariffs), byMedicationId: toMap(medications) };
  }

  /** One transaction across both tables, so a bulk apply lands whole or not at all. */
  async assignTaxCode(payload: BulkAssignTaxCodePayload): Promise<number> {
    const idsOf = (kind: TaxAssignmentKindValue): string[] =>
      payload.targets.filter((target) => target.kind === kind).map((target) => target.id);
    const [tariffResult, medicationResult] = await this.prisma.$transaction([
      this.prisma.serviceTariff.updateMany({
        where: { id: { in: idsOf('SERVICE_TARIFF') }, deletedAt: null },
        data: { taxCodeId: payload.taxCodeId },
      }),
      this.prisma.medication.updateMany({
        where: { id: { in: idsOf('MEDICATION') }, deletedAt: null },
        data: { taxCodeId: payload.taxCodeId },
      }),
    ]);
    return tariffResult.count + medicationResult.count;
  }

  /**
   * The Coretax item code and unit overrides (P27-T09), in one transaction
   * across both tables. Like `assignTaxCode`, it writes only its own columns.
   */
  async assignCoretaxCodes(payload: BulkAssignCoretaxCodesPayload): Promise<number> {
    const idsOf = (kind: TaxAssignmentKindValue): string[] =>
      payload.targets.filter((target) => target.kind === kind).map((target) => target.id);
    const data = {
      coretaxItemCode: payload.coretaxItemCode,
      coretaxUnitCode: payload.coretaxUnitCode,
    };
    const [tariffResult, medicationResult] = await this.prisma.$transaction([
      this.prisma.serviceTariff.updateMany({
        where: { id: { in: idsOf('SERVICE_TARIFF') }, deletedAt: null },
        data,
      }),
      this.prisma.medication.updateMany({
        where: { id: { in: idsOf('MEDICATION') }, deletedAt: null },
        data,
      }),
    ]);
    return tariffResult.count + medicationResult.count;
  }
}
