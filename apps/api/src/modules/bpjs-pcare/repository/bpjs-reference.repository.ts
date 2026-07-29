import {
  BPJS_REFERENCE_CATALOGS,
  BpjsReferenceCatalogStatusRecord,
  BpjsReferenceCatalogValue,
  BpjsReferenceItemRecord,
  ReplaceBpjsReferenceCatalogData,
  UpsertBpjsReferenceItemsData,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsReferenceItem } from '../../../generated/prisma/client';

/**
 * Persistence for the synced PCare reference catalogs. Bulk syncs replace a
 * catalog wholesale inside one transaction so a dropdown can never observe a
 * half-old, half-new list; keyword caches (DIAGNOSA/DPHO) upsert
 * incrementally so earlier search results survive later ones.
 */
@Injectable()
export class BpjsReferenceRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async replaceCatalog(data: ReplaceBpjsReferenceCatalogData): Promise<number> {
    await this.prismaService.$transaction([
      this.prismaService.bpjsReferenceItem.deleteMany({ where: { catalog: data.catalog } }),
      this.prismaService.bpjsReferenceItem.createMany({
        data: data.items.map((item) => ({
          catalog: data.catalog,
          code: item.code,
          display: item.display,
          groupCode: item.groupCode ?? null,
          syncedAt: data.syncedAt,
        })),
      }),
    ]);
    return data.items.length;
  }

  async upsertItems(data: UpsertBpjsReferenceItemsData): Promise<void> {
    await this.prismaService.$transaction(
      data.items.map((item) =>
        this.prismaService.bpjsReferenceItem.upsert({
          where: { catalog_code: { catalog: data.catalog, code: item.code } },
          create: {
            catalog: data.catalog,
            code: item.code,
            display: item.display,
            groupCode: item.groupCode ?? null,
            syncedAt: data.syncedAt,
          },
          update: {
            display: item.display,
            groupCode: item.groupCode ?? null,
            syncedAt: data.syncedAt,
          },
        }),
      ),
    );
  }

  async searchCatalog(options: {
    catalog: BpjsReferenceCatalogValue;
    search?: string;
    limit: number;
  }): Promise<BpjsReferenceItemRecord[]> {
    const rows = await this.prismaService.bpjsReferenceItem.findMany({
      where: {
        catalog: options.catalog,
        ...(options.search === undefined
          ? {}
          : {
              OR: [
                { code: { startsWith: options.search, mode: 'insensitive' } },
                { display: { contains: options.search, mode: 'insensitive' } },
              ],
            }),
      },
      orderBy: [{ display: 'asc' }, { code: 'asc' }],
      take: options.limit,
    });
    return rows.map((row) => this.toRecord(row));
  }

  async existsByCatalogAndCode(catalog: BpjsReferenceCatalogValue, code: string): Promise<boolean> {
    const row = await this.prismaService.bpjsReferenceItem.findUnique({
      where: { catalog_code: { catalog, code } },
      select: { id: true },
    });
    return row !== null;
  }

  async getCatalogStatuses(): Promise<BpjsReferenceCatalogStatusRecord[]> {
    const grouped = await this.prismaService.bpjsReferenceItem.groupBy({
      by: ['catalog'],
      _count: { _all: true },
      _max: { syncedAt: true },
    });
    return BPJS_REFERENCE_CATALOGS.map((catalog) => {
      const entry = grouped.find((group) => group.catalog === catalog);
      return {
        catalog,
        itemCount: entry?._count._all ?? 0,
        lastSyncedAt: entry?._max.syncedAt ?? null,
      };
    });
  }

  private toRecord(row: BpjsReferenceItem): BpjsReferenceItemRecord {
    return {
      catalog: row.catalog,
      code: row.code,
      display: row.display,
      groupCode: row.groupCode,
      syncedAt: row.syncedAt,
    };
  }
}
