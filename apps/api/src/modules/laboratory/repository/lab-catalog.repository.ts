import {
  CreateLabPanelPayload,
  CreateLabTestPayload,
  LabPanelRecord,
  LabTestRecord,
  ListLabPanelsParams,
  ListLabTestsParams,
  ReplaceLabReferenceRangesPayload,
  UpdateLabPanelPayload,
  UpdateLabTestPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabPanelRow, LabTestRow } from './lab-catalog-row.types';

const LAB_TEST_INCLUDE = {
  serviceTariff: { select: { price: true } },
  referenceRanges: { orderBy: [{ sex: 'asc' as const }, { ageMinDays: 'asc' as const }] },
};

const LAB_PANEL_INCLUDE = {
  serviceTariff: { select: { price: true } },
  members: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      labTest: { select: { code: true, name: true, specimenType: true, resultType: true } },
    },
  },
};

/**
 * Persistence for the laboratory catalog. The only layer that touches Prisma
 * for lab master data, and the layer that converts `Decimal` to `number` at
 * the boundary so no Prisma type escapes into the domain — the rule vital
 * signs and tariffs already follow.
 */
@Injectable()
export class LabCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listLabTests(params: ListLabTestsParams): Promise<LabTestRecord[]> {
    const rows = await this.prisma.labTest.findMany({
      where: {
        deletedAt: null,
        ...(params.active === undefined ? {} : { isActive: params.active }),
        ...(params.search
          ? {
              OR: [
                { code: { contains: params.search, mode: 'insensitive' as const } },
                { name: { contains: params.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
      include: LAB_TEST_INCLUDE,
    });
    return rows.map((row) => this.toLabTestRecord(row));
  }

  async findLabTestById(id: string): Promise<LabTestRecord | null> {
    const row = await this.prisma.labTest.findFirst({
      where: { id, deletedAt: null },
      include: LAB_TEST_INCLUDE,
    });
    return row ? this.toLabTestRecord(row) : null;
  }

  async findLabTestByCode(code: string): Promise<LabTestRecord | null> {
    const row = await this.prisma.labTest.findFirst({
      where: { code, deletedAt: null },
      include: LAB_TEST_INCLUDE,
    });
    return row ? this.toLabTestRecord(row) : null;
  }

  async createLabTest(payload: CreateLabTestPayload): Promise<LabTestRecord> {
    const row = await this.prisma.labTest.create({
      data: { ...payload, codedOptions: [...payload.codedOptions] },
      include: LAB_TEST_INCLUDE,
    });
    return this.toLabTestRecord(row);
  }

  async updateLabTest(payload: UpdateLabTestPayload): Promise<LabTestRecord> {
    const { id, codedOptions, ...fields } = payload;
    const row = await this.prisma.labTest.update({
      where: { id },
      data: { ...fields, ...(codedOptions ? { codedOptions: [...codedOptions] } : {}) },
      include: LAB_TEST_INCLUDE,
    });
    return this.toLabTestRecord(row);
  }

  /**
   * Replaces the whole set in one transaction. The ranges together are what
   * define "normal" for a test; patching them one at a time leaves windows
   * where two bands overlap or none applies, and a result entered in that
   * window would be flagged against a set nobody intended.
   */
  async replaceReferenceRanges(payload: ReplaceLabReferenceRangesPayload): Promise<LabTestRecord> {
    const row = await this.prisma.executeTransaction(async (tx) => {
      await tx.labReferenceRange.deleteMany({ where: { labTestId: payload.labTestId } });
      if (payload.ranges.length > 0) {
        await tx.labReferenceRange.createMany({
          data: payload.ranges.map((range) => ({
            labTestId: payload.labTestId,
            sex: range.sex ?? null,
            ageMinDays: range.ageMinDays ?? null,
            ageMaxDays: range.ageMaxDays ?? null,
            low: range.low ?? null,
            high: range.high ?? null,
            criticalLow: range.criticalLow ?? null,
            criticalHigh: range.criticalHigh ?? null,
            textNormal: range.textNormal ?? null,
          })),
        });
      }
      return tx.labTest.findUniqueOrThrow({
        where: { id: payload.labTestId },
        include: LAB_TEST_INCLUDE,
      }) as unknown as Promise<LabTestRow>;
    });
    return this.toLabTestRecord(row);
  }

  async listLabPanels(params: ListLabPanelsParams): Promise<LabPanelRecord[]> {
    const rows = await this.prisma.labPanel.findMany({
      where: {
        deletedAt: null,
        ...(params.active === undefined ? {} : { isActive: params.active }),
        ...(params.search
          ? {
              OR: [
                { code: { contains: params.search, mode: 'insensitive' as const } },
                { name: { contains: params.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
      include: LAB_PANEL_INCLUDE,
    });
    return rows.map((row) => this.toLabPanelRecord(row));
  }

  async findLabPanelById(id: string): Promise<LabPanelRecord | null> {
    const row = await this.prisma.labPanel.findFirst({
      where: { id, deletedAt: null },
      include: LAB_PANEL_INCLUDE,
    });
    return row ? this.toLabPanelRecord(row) : null;
  }

  async findLabPanelByCode(code: string): Promise<LabPanelRecord | null> {
    const row = await this.prisma.labPanel.findFirst({
      where: { code, deletedAt: null },
      include: LAB_PANEL_INCLUDE,
    });
    return row ? this.toLabPanelRecord(row) : null;
  }

  async countActiveLabTests(ids: readonly string[]): Promise<number> {
    return this.prisma.labTest.count({
      where: { id: { in: [...ids] }, deletedAt: null },
    });
  }

  async createLabPanel(payload: CreateLabPanelPayload): Promise<LabPanelRecord> {
    const row = await this.prisma.labPanel.create({
      data: {
        code: payload.code,
        name: payload.name,
        isActive: payload.isActive,
        serviceTariffId: payload.serviceTariffId,
        members: {
          create: payload.labTestIds.map((labTestId, index) => ({
            labTestId,
            sortOrder: index + 1,
          })),
        },
      },
      include: LAB_PANEL_INCLUDE,
    });
    return this.toLabPanelRecord(row);
  }

  /**
   * Membership is replaced wholesale for the same reason ranges are: the list
   * *and its order* are the panel, and a partial edit would leave a report
   * printing its tests in an order nobody chose.
   */
  async updateLabPanel(payload: UpdateLabPanelPayload): Promise<LabPanelRecord> {
    const { id, labTestIds, ...fields } = payload;
    const row = await this.prisma.executeTransaction(async (tx) => {
      await tx.labPanel.update({ where: { id }, data: fields });
      if (labTestIds) {
        await tx.labPanelMember.deleteMany({ where: { panelId: id } });
        await tx.labPanelMember.createMany({
          data: labTestIds.map((labTestId, index) => ({
            panelId: id,
            labTestId,
            sortOrder: index + 1,
          })),
        });
      }
      return tx.labPanel.findUniqueOrThrow({
        where: { id },
        include: LAB_PANEL_INCLUDE,
      }) as unknown as Promise<LabPanelRow>;
    });
    return this.toLabPanelRecord(row);
  }

  private toLabTestRecord(row: LabTestRow): LabTestRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      loincCode: row.loincCode,
      loincDisplay: row.loincDisplay,
      specimenType: row.specimenType,
      resultType: row.resultType,
      unit: row.unit,
      decimals: row.decimals,
      codedOptions: row.codedOptions,
      isActive: row.isActive,
      serviceTariffId: row.serviceTariffId,
      price: this.toNumberOrNull(row.serviceTariff?.price ?? null),
      referenceRanges: row.referenceRanges.map((range) => ({
        id: range.id,
        sex: range.sex,
        ageMinDays: range.ageMinDays,
        ageMaxDays: range.ageMaxDays,
        low: this.toNumberOrNull(range.low),
        high: this.toNumberOrNull(range.high),
        criticalLow: this.toNumberOrNull(range.criticalLow),
        criticalHigh: this.toNumberOrNull(range.criticalHigh),
        textNormal: range.textNormal,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toLabPanelRecord(row: LabPanelRow): LabPanelRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.isActive,
      serviceTariffId: row.serviceTariffId,
      price: this.toNumberOrNull(row.serviceTariff?.price ?? null),
      members: row.members.map((member) => ({
        labTestId: member.labTestId,
        code: member.labTest.code,
        name: member.labTest.name,
        specimenType: member.labTest.specimenType,
        resultType: member.labTest.resultType,
        sortOrder: member.sortOrder,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toNumberOrNull(value: { toNumber: () => number } | null): number | null {
    return value === null ? null : value.toNumber();
  }
}
