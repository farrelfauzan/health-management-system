import {
  AddressChainCodes,
  ListVillagesParams,
  ListVillagesResult,
  RegionRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

const REGION_SELECT = { code: true, name: true } as const;

type RegionRow = { code: string; name: string };

/**
 * Reads over the four region tables (P19-T10). The tables have no soft
 * delete — a retired region is `is_active = false`, never removed — so these
 * go to the delegates directly rather than through the `*Active` helpers.
 * Lists return active rows only; {@link findChain} does not filter on it,
 * because an address that already names a retired village must still
 * resolve when it is read back or re-saved unchanged.
 */
@Injectable()
export class RegionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listProvinces(): Promise<RegionRecord[]> {
    const rows = await this.prisma.province.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: REGION_SELECT,
    });
    return rows.map((row) => toRegionRecord(row, null));
  }

  async listRegencies(provinceCode: string): Promise<RegionRecord[]> {
    const rows = await this.prisma.regency.findMany({
      where: { provinceCode, isActive: true },
      orderBy: { name: 'asc' },
      select: REGION_SELECT,
    });
    return rows.map((row) => toRegionRecord(row, provinceCode));
  }

  async listDistricts(regencyCode: string): Promise<RegionRecord[]> {
    const rows = await this.prisma.district.findMany({
      where: { regencyCode, isActive: true },
      orderBy: { name: 'asc' },
      select: REGION_SELECT,
    });
    return rows.map((row) => toRegionRecord(row, regencyCode));
  }

  /**
   * Prefix search, case-insensitive: the form fills a combobox from what the
   * clerk has typed so far, and `Ka` should offer `Kayu Putih`, not every
   * village with `ka` somewhere in its name. Served by the
   * `(district_code, name)` index.
   */
  async listVillages(params: ListVillagesParams): Promise<ListVillagesResult> {
    const where: Prisma.VillageWhereInput = {
      districtCode: params.districtCode,
      isActive: true,
      ...(params.q ? { name: { startsWith: params.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const items = await tx.village.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: REGION_SELECT,
      });
      const count = await tx.village.count({ where });
      return [items, count] as const;
    });
    return {
      items: rows.map((row) => toRegionRecord(row, params.districtCode)),
      total,
    };
  }

  /**
   * The four rows a structured address names, each with its parent code, so
   * the service can check the chain without a second round trip per level.
   * A level whose code is unknown comes back `null`.
   */
  async findChain(codes: AddressChainCodes): Promise<{
    province: RegionRecord | null;
    regency: RegionRecord | null;
    district: RegionRecord | null;
    village: RegionRecord | null;
  }> {
    const [province, regency, district, village] = await Promise.all([
      this.prisma.province.findUnique({ where: { code: codes.provinceCode }, select: REGION_SELECT }),
      this.prisma.regency.findUnique({
        where: { code: codes.regencyCode },
        select: { ...REGION_SELECT, provinceCode: true },
      }),
      this.prisma.district.findUnique({
        where: { code: codes.districtCode },
        select: { ...REGION_SELECT, regencyCode: true },
      }),
      this.prisma.village.findUnique({
        where: { code: codes.villageCode },
        select: { ...REGION_SELECT, districtCode: true },
      }),
    ]);
    return {
      province: province === null ? null : toRegionRecord(province, null),
      regency: regency === null ? null : toRegionRecord(regency, regency.provinceCode),
      district: district === null ? null : toRegionRecord(district, district.regencyCode),
      village: village === null ? null : toRegionRecord(village, village.districtCode),
    };
  }
}

function toRegionRecord(row: RegionRow, parentCode: string | null): RegionRecord {
  return { code: row.code, name: row.name, parentCode };
}
