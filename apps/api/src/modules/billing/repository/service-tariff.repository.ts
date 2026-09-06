import {
  CreateServiceTariffRecordPayload,
  ListServiceTariffsParams,
  ServiceTariffRecord,
  UpdateServiceTariffRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TariffIdentifierConflictError } from './tariff-identifier-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

const SERVICE_TARIFF_INCLUDE = {
  roomClass: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ServiceTariffInclude;

const SERVICE_TARIFF_ORDER_BY = [
  { category: 'asc' },
  { code: 'asc' },
] satisfies Prisma.ServiceTariffOrderByWithRelationInput[];

type ServiceTariffRow = {
  id: string;
  code: string;
  name: string;
  category: ServiceTariffRecord['category'];
  icd9cmCode: string | null;
  roomClass: ServiceTariffRecord['roomClass'];
  price: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ServiceTariffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listServiceTariffs(params: ListServiceTariffsParams): Promise<{
    items: ServiceTariffRecord[];
    page: number;
    limit: number;
    total: number;
  }> {
    const { page, limit, category, isActive, search } = params;
    const skip = (page - 1) * limit;
    const where = {
      ...(category ? { category } : {}),
      ...(isActive === undefined ? {} : { isActive }),
      ...this.buildSearchFilter(search),
    };
    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const tariffs = await this.prisma.findManyActive(tx.serviceTariff, {
        where,
        skip,
        take: limit,
        orderBy: SERVICE_TARIFF_ORDER_BY,
        include: SERVICE_TARIFF_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.serviceTariff, { where });
      return [tariffs, count] as const;
    });

    return { items: items.map((row) => this.toServiceTariffRecord(row)), page, limit, total };
  }

  async findServiceTariffById(id: string): Promise<ServiceTariffRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.serviceTariff, {
      where: { id },
      include: SERVICE_TARIFF_INCLUDE,
    });
    return row ? this.toServiceTariffRecord(row) : null;
  }

  async findActiveConsultationTariffs(): Promise<ServiceTariffRecord[]> {
    const rows = await this.prisma.findManyActive(this.prisma.serviceTariff, {
      where: { category: 'CONSULTATION' as const, isActive: true },
      orderBy: { code: 'asc' as const },
      include: SERVICE_TARIFF_INCLUDE,
    });
    return rows.map((row) => this.toServiceTariffRecord(row));
  }

  /**
   * The accommodation price list. One live row per ward class is guaranteed by
   * `service_tariffs_room_class_live_key`, so the caller may match on
   * `roomClass` without worrying which of two prices it got.
   */
  async findActiveAccommodationTariffs(): Promise<ServiceTariffRecord[]> {
    const rows = await this.prisma.findManyActive(this.prisma.serviceTariff, {
      where: { category: 'ACCOMMODATION' as const, isActive: true },
      orderBy: { code: 'asc' as const },
      include: SERVICE_TARIFF_INCLUDE,
    });
    return rows.map((row) => this.toServiceTariffRecord(row));
  }

  async findActiveTariffsByIcd9cmCodes(codes: string[]): Promise<ServiceTariffRecord[]> {
    if (codes.length === 0) {
      return [];
    }
    const rows = await this.prisma.findManyActive(this.prisma.serviceTariff, {
      where: { icd9cmCode: { in: codes }, isActive: true },
      include: SERVICE_TARIFF_INCLUDE,
    });
    return rows.map((row) => this.toServiceTariffRecord(row));
  }

  /**
   * Tariffs matched by their own `code`, which is how both a vaccination
   * (P10-T16) and a compounding fee (P10-T18) are priced: neither has an
   * ICD-9-CM code, so the clinic prices them by giving a tariff the same code
   * as the catalog row. Deliberately not restricted to one category — a clinic
   * that files those tariffs under PROCEDURE rather than OTHER is not wrong,
   * and refusing to find them would turn a naming preference into an unpriced
   * line.
   */
  async findActiveTariffsByCodes(codes: string[]): Promise<ServiceTariffRecord[]> {
    if (codes.length === 0) {
      return [];
    }
    const rows = await this.prisma.findManyActive(this.prisma.serviceTariff, {
      where: { code: { in: codes }, isActive: true },
      include: SERVICE_TARIFF_INCLUDE,
    });
    return rows.map((row) => this.toServiceTariffRecord(row));
  }

  async createServiceTariff(
    payload: CreateServiceTariffRecordPayload,
  ): Promise<ServiceTariffRecord> {
    try {
      const created = await this.prisma.serviceTariff.create({
        data: {
          code: payload.code,
          name: payload.name,
          category: payload.category,
          icd9cmCode: payload.icd9cmCode,
          roomClassId: payload.roomClassId,
          price: payload.price,
          isActive: payload.isActive,
        },
        include: SERVICE_TARIFF_INCLUDE,
      });
      return this.toServiceTariffRecord(created);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async updateServiceTariff(
    payload: UpdateServiceTariffRecordPayload,
  ): Promise<ServiceTariffRecord> {
    const { id, ...changes } = payload;
    try {
      const updated = await this.prisma.serviceTariff.update({
        where: { id },
        data: changes,
        include: SERVICE_TARIFF_INCLUDE,
      });
      return this.toServiceTariffRecord(updated);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  private buildSearchFilter(search?: string) {
    if (!search) {
      return {};
    }
    return {
      OR: [
        { code: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
      ],
    };
  }

  private mapUniqueViolation(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_VIOLATION_CODE
    ) {
      const target = err.meta?.target;
      const targets = Array.isArray(target) ? target.map(String) : [String(target)];
      return new TariffIdentifierConflictError(
        targets.some((column) => column.includes('icd9cm')) ? 'icd9cmCode' : 'code',
      );
    }
    return err;
  }

  /** `Decimal` price becomes a number here so no Prisma type escapes the repository. */
  private toServiceTariffRecord(row: ServiceTariffRow): ServiceTariffRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      icd9cmCode: row.icd9cmCode,
      roomClass: row.roomClass,
      price: Number(row.price),
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
