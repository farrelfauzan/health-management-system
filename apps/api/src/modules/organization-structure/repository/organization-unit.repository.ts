import {
  CreateOrganizationUnitRecordPayload,
  ListOrganizationUnitsParams,
  MoveOrganizationUnitRecordPayload,
  OrganizationUnitMemberTallyRecord,
  OrganizationUnitRecord,
  UpdateOrganizationUnitRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const ORGANIZATION_UNIT_SELECT = {
  id: true,
  parentId: true,
  name: true,
  kind: true,
  path: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * Siblings order by `sortOrder`, then `name` to break ties. Without the second
 * key a tree whose units all sit at the default order would re-shuffle between
 * requests, which reads as data loss to anyone watching the screen.
 */
const ORGANIZATION_UNIT_ORDER_BY = [
  { sortOrder: 'asc' },
  { name: 'asc' },
] satisfies Prisma.OrganizationUnitOrderByWithRelationInput[];

@Injectable()
export class OrganizationUnitRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every unit in scope, flat. The service assembles the tree, because the
   * nesting is a presentation concern and the rules it enforces — depth,
   * ancestry, cycles — all read the flat set anyway.
   */
  async listUnits(params: ListOrganizationUnitsParams): Promise<OrganizationUnitRecord[]> {
    const where: Prisma.OrganizationUnitWhereInput = {
      ...(params.includeArchived === true ? {} : { deletedAt: null }),
    };
    if (params.rootId) {
      const root = await this.prisma.organizationUnit.findFirst({
        where: { id: params.rootId },
        select: { path: true },
      });
      if (!root) {
        return [];
      }
      // `path` ends in a slash and holds the row itself, so the prefix of the
      // root's own path matches the root and every descendant in one scan.
      where.path = { startsWith: root.path };
    }
    const rows = await this.prisma.organizationUnit.findMany({
      where,
      orderBy: ORGANIZATION_UNIT_ORDER_BY,
      select: ORGANIZATION_UNIT_SELECT,
    });

    return rows.map((row) => this.toRecord(row));
  }

  /** Live units only — an archived unit is not a valid parent or edit target. */
  async findLiveUnitById(id: string): Promise<OrganizationUnitRecord | null> {
    const row = await this.prisma.organizationUnit.findFirst({
      where: { id, deletedAt: null },
      select: ORGANIZATION_UNIT_SELECT,
    });

    return row ? this.toRecord(row) : null;
  }

  /** Includes archived rows, for the delete path — which is what acts on them. */
  async findUnitById(id: string): Promise<OrganizationUnitRecord | null> {
    const row = await this.prisma.organizationUnit.findUnique({
      where: { id },
      select: ORGANIZATION_UNIT_SELECT,
    });

    return row ? this.toRecord(row) : null;
  }

  /**
   * The subtree rooted at `path`, archived rows included. A move must rewrite
   * every descendant's path whether or not it is archived, or restoring one
   * later would restore it under an address that no longer exists.
   */
  async listSubtree(path: string): Promise<OrganizationUnitRecord[]> {
    const rows = await this.prisma.organizationUnit.findMany({
      where: { path: { startsWith: path } },
      orderBy: ORGANIZATION_UNIT_ORDER_BY,
      select: ORGANIZATION_UNIT_SELECT,
    });

    return rows.map((row) => this.toRecord(row));
  }

  async countLiveChildren(parentId: string): Promise<number> {
    return this.prisma.organizationUnit.count({
      where: { parentId, deletedAt: null },
    });
  }

  /** Staff sitting directly in this unit; deleted accounts do not count. */
  async countMembers(organizationUnitId: string): Promise<number> {
    return this.prisma.user.count({
      where: { organizationUnitId, deletedAt: null },
    });
  }

  async tallyMembersByUnit(unitIds: string[]): Promise<OrganizationUnitMemberTallyRecord[]> {
    if (unitIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.user.groupBy({
      by: ['organizationUnitId'],
      where: { organizationUnitId: { in: unitIds }, deletedAt: null },
      _count: { _all: true },
    });

    return rows
      .filter((row): row is typeof row & { organizationUnitId: string } =>
        row.organizationUnitId !== null,
      )
      .map((row) => ({ organizationUnitId: row.organizationUnitId, count: row._count._all }));
  }

  async createUnit(payload: CreateOrganizationUnitRecordPayload): Promise<OrganizationUnitRecord> {
    const created = await this.prisma.organizationUnit.create({
      data: {
        name: payload.name,
        kind: payload.kind,
        parentId: payload.parentId,
        path: payload.path,
        sortOrder: payload.sortOrder,
      },
      select: ORGANIZATION_UNIT_SELECT,
    });

    return this.toRecord(created);
  }

  /**
   * `path` is written after the insert because it contains the row's own id,
   * which Postgres only assigns on write. Both statements share one transaction
   * so a crash between them cannot leave a unit with a placeholder address.
   */
  async createUnitWithSelfPath(
    payload: Omit<CreateOrganizationUnitRecordPayload, 'path'>,
    parentPath: string,
  ): Promise<OrganizationUnitRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const created = await tx.organizationUnit.create({
        data: {
          name: payload.name,
          kind: payload.kind,
          parentId: payload.parentId,
          path: '',
          sortOrder: payload.sortOrder,
        },
        select: { id: true },
      });
      const updated = await tx.organizationUnit.update({
        where: { id: created.id },
        data: { path: `${parentPath}${created.id}/` },
        select: ORGANIZATION_UNIT_SELECT,
      });

      return this.toRecord(updated);
    });
  }

  async updateUnit(payload: UpdateOrganizationUnitRecordPayload): Promise<OrganizationUnitRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.organizationUnit.update({
      where: { id },
      data: changes,
      select: ORGANIZATION_UNIT_SELECT,
    });

    return this.toRecord(updated);
  }

  /**
   * Re-parents the unit and rewrites every path in its subtree in one
   * transaction. A tree observed halfway through would report an ancestry that
   * contradicts `parentId`, which is the one inconsistency the materialised
   * path can produce.
   */
  async moveUnit(payload: MoveOrganizationUnitRecordPayload): Promise<OrganizationUnitRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      for (const update of payload.pathUpdates) {
        await tx.organizationUnit.update({
          where: { id: update.id },
          data: { path: update.path },
        });
      }
      const updated = await tx.organizationUnit.update({
        where: { id: payload.id },
        data: {
          parentId: payload.parentId,
          ...(payload.sortOrder === undefined ? {} : { sortOrder: payload.sortOrder }),
        },
        select: ORGANIZATION_UNIT_SELECT,
      });

      return this.toRecord(updated);
    });
  }

  async archiveUnit(id: string): Promise<OrganizationUnitRecord> {
    const archived = await this.prisma.organizationUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: ORGANIZATION_UNIT_SELECT,
    });

    return this.toRecord(archived);
  }

  async deleteUnit(id: string): Promise<void> {
    await this.prisma.hardDelete(this.prisma.organizationUnit, { id });
  }

  private toRecord(row: {
    id: string;
    parentId: string | null;
    name: string;
    kind: OrganizationUnitRecord['kind'];
    path: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): OrganizationUnitRecord {
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      kind: row.kind,
      path: row.path,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
