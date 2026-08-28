import {
  CreateOrganizationUnitInput,
  ListOrganizationUnitsQueryInput,
  MAX_ORGANIZATION_UNIT_DEPTH,
  MoveOrganizationUnitInput,
  OrganizationUnitPathUpdate,
  OrganizationUnitRecord,
  OrganizationUnitResponse,
  OrganizationUnitTreeResponse,
  UpdateOrganizationUnitInput,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { OrganizationUnitRepository } from '../repository/organization-unit.repository';
import { OrganizationUnitMapper } from './organization-unit.mapper';

const ORGANIZATION_UNIT_AUDIT_RESOURCE = 'organization-unit';

/** Root units hang off the empty path, so their own path is `/{id}/`. */
const ROOT_PATH_PREFIX = '/';

/**
 * The org chart (SJ-1).
 *
 * Every structural rule lives here rather than in the repository, because each
 * one is a question about the tree as a whole — how deep it would become, whether
 * a move would make a unit its own ancestor, whether anything still hangs off a
 * unit about to be deleted — and none of them is expressible as a constraint on
 * a single row. The database backstops the two that are (`RESTRICT` on both
 * foreign keys, and a one-hop self-parent CHECK); the rest are enforced before
 * the write.
 *
 * `path` is written only from here. It is the materialised ancestry that makes
 * a subtree one prefix scan, and it is derived state: `parentId` is the truth.
 */
@Injectable()
export class OrganizationUnitService {
  constructor(
    private readonly organizationUnitRepository: OrganizationUnitRepository,
    private readonly organizationUnitMapper: OrganizationUnitMapper,
    private readonly auditService: AuditService,
  ) {}

  /** The whole chart in one call, or the subtree under `rootId`. */
  async getTree(query: ListOrganizationUnitsQueryInput): Promise<OrganizationUnitTreeResponse> {
    const units = await this.organizationUnitRepository.listUnits({
      ...(query.rootId === undefined ? {} : { rootId: query.rootId }),
      ...(query.includeArchived === undefined ? {} : { includeArchived: query.includeArchived }),
    });
    const memberCountByUnitId = await this.loadMemberCounts(units);

    return this.organizationUnitMapper.toTree(units, memberCountByUnitId);
  }

  async createUnit(
    input: CreateOrganizationUnitInput,
    actorUserId: string,
  ): Promise<OrganizationUnitResponse> {
    const parent = await this.resolveParent(input.parentId ?? null);
    const parentDepth = parent ? this.organizationUnitMapper.resolveDepth(parent.path) : 0;
    this.assertDepthWithinCap(parentDepth + 1);
    const created = await this.organizationUnitRepository.createUnitWithSelfPath(
      {
        name: input.name,
        kind: input.kind,
        parentId: parent?.id ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
      parent ? parent.path : ROOT_PATH_PREFIX,
    );
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_CREATED,
      resource: ORGANIZATION_UNIT_AUDIT_RESOURCE,
      actorUserId,
      resourceId: created.id,
      metadata: {
        after: { name: created.name, kind: created.kind, parentId: created.parentId },
      },
    });

    return this.organizationUnitMapper.toResponse(created, 0);
  }

  async updateUnit(
    id: string,
    input: UpdateOrganizationUnitInput,
    actorUserId: string,
  ): Promise<OrganizationUnitResponse> {
    const existing = await this.requireLiveUnit(id);
    const updated = await this.organizationUnitRepository.updateUnit({
      id,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    });
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_UPDATED,
      resource: ORGANIZATION_UNIT_AUDIT_RESOURCE,
      actorUserId,
      resourceId: id,
      metadata: {
        before: { name: existing.name, kind: existing.kind, sortOrder: existing.sortOrder },
        after: { name: updated.name, kind: updated.kind, sortOrder: updated.sortOrder },
      },
    });

    return this.organizationUnitMapper.toResponse(
      updated,
      await this.organizationUnitRepository.countMembers(id),
    );
  }

  /**
   * Re-parents a unit and carries its whole subtree with it.
   *
   * Three refusals, in the order a caller hits them: a unit cannot move under
   * itself or under one of its own descendants (that would detach the cycle
   * from the tree entirely, leaving a ring no root reaches); the deepest node in
   * the moving subtree must still fit under the cap at its new position; and
   * the destination must exist and be live.
   */
  async moveUnit(
    id: string,
    input: MoveOrganizationUnitInput,
    actorUserId: string,
  ): Promise<OrganizationUnitResponse> {
    const unit = await this.requireLiveUnit(id);
    const parent = await this.resolveParent(input.parentId);
    this.assertNotOwnDescendant(unit, parent);
    const subtree = await this.organizationUnitRepository.listSubtree(unit.path);
    const parentPath = parent ? parent.path : ROOT_PATH_PREFIX;
    const movedDepth = this.organizationUnitMapper.resolveDepth(parentPath) + 1;
    this.assertDepthWithinCap(movedDepth + this.resolveSubtreeHeight(unit, subtree));
    const movedPath = `${parentPath}${unit.id}/`;
    const moved = await this.organizationUnitRepository.moveUnit({
      id,
      parentId: parent?.id ?? null,
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      pathUpdates: this.buildPathUpdates(unit, subtree, movedPath),
    });
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_MOVED,
      resource: ORGANIZATION_UNIT_AUDIT_RESOURCE,
      actorUserId,
      resourceId: id,
      metadata: {
        before: { parentId: unit.parentId },
        after: { parentId: moved.parentId },
        // The count is the point: a move rewrites rows nobody edited, and this
        // is how an investigator knows how far the change reached.
        descendantsRepathed: Math.max(0, subtree.length - 1),
      },
    });

    return this.organizationUnitMapper.toResponse(
      moved,
      await this.organizationUnitRepository.countMembers(id),
    );
  }

  /**
   * Soft delete. Refused while live child units remain, because a hidden parent
   * whose children are still visible renders as a set of orphaned roots — the
   * chart would show a structure the clinic does not have.
   *
   * Members are deliberately *not* a blocker. The row survives an archive, so
   * their foreign key stays valid and nothing is lost; the unit simply leaves
   * the chart while whoever owns headcount reassigns the people.
   */
  async archiveUnit(id: string, actorUserId: string): Promise<void> {
    const unit = await this.requireLiveUnit(id);
    const liveChildren = await this.organizationUnitRepository.countLiveChildren(id);
    if (liveChildren > 0) {
      throw new ConflictException({
        code: 'ORGANIZATION_UNIT_HAS_CHILDREN',
        message: `Archive the ${liveChildren} unit(s) under this one first`,
      });
    }
    await this.organizationUnitRepository.archiveUnit(id);
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_ARCHIVED,
      resource: ORGANIZATION_UNIT_AUDIT_RESOURCE,
      actorUserId,
      resourceId: id,
      metadata: { before: { name: unit.name, parentId: unit.parentId } },
    });
  }

  /**
   * Hard delete, for a unit created in error.
   *
   * Stricter than archive on both counts: *any* child blocks it, archived ones
   * included, and so does a single member. The row is about to stop existing,
   * so nothing may still point at it — the `RESTRICT` foreign keys would refuse
   * anyway, and a 500 from a constraint is a worse answer than a 409 that says
   * what to clear first.
   */
  async deleteUnit(id: string, actorUserId: string): Promise<void> {
    const unit = await this.requireUnit(id);
    const subtree = await this.organizationUnitRepository.listSubtree(unit.path);
    const descendants = Math.max(0, subtree.length - 1);
    if (descendants > 0) {
      throw new ConflictException({
        code: 'ORGANIZATION_UNIT_HAS_CHILDREN',
        message: `This unit still holds ${descendants} unit(s); delete or move them first`,
      });
    }
    const members = await this.organizationUnitRepository.countMembers(id);
    if (members > 0) {
      throw new ConflictException({
        code: 'ORGANIZATION_UNIT_HAS_MEMBERS',
        message: `This unit still has ${members} member(s); reassign them first`,
      });
    }
    await this.organizationUnitRepository.deleteUnit(id);
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_DELETED,
      resource: ORGANIZATION_UNIT_AUDIT_RESOURCE,
      actorUserId,
      resourceId: id,
      metadata: { before: { name: unit.name, kind: unit.kind, parentId: unit.parentId } },
    });
  }

  /** How many levels the subtree adds below its own root. A leaf adds none. */
  private resolveSubtreeHeight(
    unit: OrganizationUnitRecord,
    subtree: OrganizationUnitRecord[],
  ): number {
    const rootDepth = this.organizationUnitMapper.resolveDepth(unit.path);
    return subtree.reduce(
      (height, node) =>
        Math.max(height, this.organizationUnitMapper.resolveDepth(node.path) - rootDepth),
      0,
    );
  }

  /**
   * Rewrites each subtree path by swapping the moved unit's old prefix for its
   * new one. String surgery rather than a re-walk of `parentId`, because the
   * prefix is exactly what changed and everything below it is unaffected.
   */
  private buildPathUpdates(
    unit: OrganizationUnitRecord,
    subtree: OrganizationUnitRecord[],
    movedPath: string,
  ): OrganizationUnitPathUpdate[] {
    return subtree.map((node) => ({
      id: node.id,
      path: `${movedPath}${node.path.slice(unit.path.length)}`,
    }));
  }

  private assertDepthWithinCap(depth: number): void {
    if (depth > MAX_ORGANIZATION_UNIT_DEPTH) {
      throw new BadRequestException({
        code: 'ORGANIZATION_UNIT_DEPTH_EXCEEDED',
        message: `The organization structure is limited to ${MAX_ORGANIZATION_UNIT_DEPTH} levels`,
      });
    }
  }

  /**
   * A destination inside the moving subtree — the unit itself included — would
   * cut that subtree loose from every root. The prefix test catches it at any
   * distance, which is what the database's one-hop CHECK cannot do.
   */
  private assertNotOwnDescendant(
    unit: OrganizationUnitRecord,
    parent: OrganizationUnitRecord | null,
  ): void {
    if (parent && parent.path.startsWith(unit.path)) {
      throw new BadRequestException({
        code: 'ORGANIZATION_UNIT_CYCLE',
        message: 'A unit cannot be moved under itself or one of its own sub-units',
      });
    }
  }

  private async resolveParent(parentId: string | null): Promise<OrganizationUnitRecord | null> {
    if (parentId === null) {
      return null;
    }
    const parent = await this.organizationUnitRepository.findLiveUnitById(parentId);
    if (!parent) {
      throw new NotFoundException('Parent organization unit not found');
    }
    return parent;
  }

  private async requireLiveUnit(id: string): Promise<OrganizationUnitRecord> {
    const unit = await this.organizationUnitRepository.findLiveUnitById(id);
    if (!unit) {
      throw new NotFoundException('Organization unit not found');
    }
    return unit;
  }

  private async requireUnit(id: string): Promise<OrganizationUnitRecord> {
    const unit = await this.organizationUnitRepository.findUnitById(id);
    if (!unit) {
      throw new NotFoundException('Organization unit not found');
    }
    return unit;
  }

  private async loadMemberCounts(units: OrganizationUnitRecord[]): Promise<Map<string, number>> {
    const tallies = await this.organizationUnitRepository.tallyMembersByUnit(
      units.map((unit) => unit.id),
    );
    return new Map(tallies.map((tally) => [tally.organizationUnitId, tally.count]));
  }
}
