import {
  ClinicianFeeRuleDetailRecord,
  ClinicianFeeRuleRecord,
  ClinicianFeeRuleTargetState,
  CreateClinicianFeeRulePayload,
  FindClinicianFeeRuleTargetParams,
  FindClinicianFeeRulesForTargetParams,
  UpdateClinicianFeeRulePayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { ClinicianFeeRule, Prisma } from '../../../generated/prisma/client';

const CALENDAR_DATE_LENGTH = 10;

const RULE_DETAIL_INCLUDE = {
  serviceTariff: { select: { code: true, name: true, category: true } },
  doctor: { select: { fullName: true, profession: true } },
} as const satisfies Prisma.ClinicianFeeRuleInclude;

type ClinicianFeeRuleDetailRow = Prisma.ClinicianFeeRuleGetPayload<{
  include: typeof RULE_DETAIL_INCLUDE;
}>;

function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, CALENDAR_DATE_LENGTH);
}

/**
 * Persistence for jasa medis rules (P27-T06). Deleting is soft: the ledger
 * snapshots each rule's terms, and the rule row stays as provenance.
 */
@Injectable()
export class ClinicianFeeRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(): Promise<ClinicianFeeRuleDetailRecord[]> {
    const rows = await this.prisma.clinicianFeeRule.findMany({
      where: { deletedAt: null },
      include: RULE_DETAIL_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map((row) => this.toDetailRecord(row));
  }

  async findRuleById(id: string): Promise<ClinicianFeeRuleDetailRecord | null> {
    const row = await this.prisma.clinicianFeeRule.findFirst({
      where: { id, deletedAt: null },
      include: RULE_DETAIL_INCLUDE,
    });
    return row ? this.toDetailRecord(row) : null;
  }

  /** The live rules sharing one target and clinician, for the overlap check. */
  async findRulesForTarget(
    params: FindClinicianFeeRulesForTargetParams,
  ): Promise<ClinicianFeeRuleRecord[]> {
    const rows = await this.prisma.clinicianFeeRule.findMany({
      where: {
        deletedAt: null,
        serviceTariffId: params.serviceTariffId,
        category: params.category,
        doctorId: params.doctorId,
        ...(params.excludeRuleId ? { id: { not: params.excludeRuleId } } : {}),
      },
    });
    return rows.map((row) => this.toRecord(row));
  }

  /**
   * Every live rule that could price a line for this clinician: theirs and
   * the clinic-wide ones. Read inside the payment transaction; the table is a
   * clinic's handful of agreements, so resolution happens in memory.
   */
  async findRulesForClinician(
    tx: PrismaTransactionClient,
    doctorId: string,
  ): Promise<ClinicianFeeRuleRecord[]> {
    const rows = await tx.clinicianFeeRule.findMany({
      where: { deletedAt: null, OR: [{ doctorId }, { doctorId: null }] },
    });
    return rows.map((row) => this.toRecord(row));
  }

  /** Whether the tariff and clinician a new rule names are live rows. */
  async findTargetState(
    params: FindClinicianFeeRuleTargetParams,
  ): Promise<ClinicianFeeRuleTargetState> {
    const [tariffCount, doctorCount] = await Promise.all([
      params.serviceTariffId === null
        ? Promise.resolve(1)
        : this.prisma.serviceTariff.count({
            where: { id: params.serviceTariffId, deletedAt: null },
          }),
      params.doctorId === null
        ? Promise.resolve(1)
        : this.prisma.doctorProfile.count({ where: { id: params.doctorId, deletedAt: null } }),
    ]);
    return { isTariffFound: tariffCount > 0, isDoctorFound: doctorCount > 0 };
  }

  async createRule(payload: CreateClinicianFeeRulePayload): Promise<ClinicianFeeRuleDetailRecord> {
    const row = await this.prisma.clinicianFeeRule.create({
      data: {
        serviceTariffId: payload.serviceTariffId,
        category: payload.category,
        doctorId: payload.doctorId,
        mode: payload.mode,
        value: payload.value,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo,
      },
      include: RULE_DETAIL_INCLUDE,
    });
    return this.toDetailRecord(row);
  }

  async updateRule(payload: UpdateClinicianFeeRulePayload): Promise<ClinicianFeeRuleDetailRecord> {
    const row = await this.prisma.clinicianFeeRule.update({
      where: { id: payload.id },
      data: {
        mode: payload.mode,
        value: payload.value,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo,
      },
      include: RULE_DETAIL_INCLUDE,
    });
    return this.toDetailRecord(row);
  }

  async softDeleteRule(id: string, deletedAt: Date): Promise<void> {
    await this.prisma.clinicianFeeRule.update({ where: { id }, data: { deletedAt } });
  }

  private toRecord(row: ClinicianFeeRule): ClinicianFeeRuleRecord {
    return {
      id: row.id,
      serviceTariffId: row.serviceTariffId,
      category: row.category,
      doctorId: row.doctorId,
      mode: row.mode,
      value: Number(row.value),
      effectiveFrom: toCalendarDate(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toCalendarDate(row.effectiveTo) : null,
    };
  }

  private toDetailRecord(row: ClinicianFeeRuleDetailRow): ClinicianFeeRuleDetailRecord {
    return {
      ...this.toRecord(row),
      serviceTariff: row.serviceTariff,
      doctor: row.doctor,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
