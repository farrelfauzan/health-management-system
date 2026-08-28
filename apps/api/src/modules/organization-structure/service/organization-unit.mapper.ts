import {
  OrganizationUnitRecord,
  OrganizationUnitResponse,
  OrganizationUnitTreeNode,
  OrganizationUnitTreeResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/**
 * Record → response translation for the org chart (SJ-1), including the one
 * assembly step: turning the flat row set the repository returns into the
 * nested tree every caller renders.
 *
 * `path` never crosses this boundary. It is a chain of internal ids that says
 * exactly what the nesting already says, and publishing it would invite a
 * client to parse ancestry out of a string the server is free to rewrite on
 * any move.
 */
@Injectable()
export class OrganizationUnitMapper {
  /**
   * Depth is counted from `path` rather than stored, and is 1-based so a root
   * reads as level 1 — which is what the depth cap counts and what the UI
   * shows.
   */
  resolveDepth(path: string): number {
    return path.split('/').filter((segment) => segment.length > 0).length;
  }

  /**
   * `memberCount` is passed in rather than read here: it is a count over
   * `users`, and a mapper that queried would turn one tree render into one
   * round trip per node.
   */
  toResponse(unit: OrganizationUnitRecord, memberCount: number): OrganizationUnitResponse {
    return {
      id: unit.id,
      parentId: unit.parentId,
      name: unit.name,
      kind: unit.kind,
      depth: this.resolveDepth(unit.path),
      sortOrder: unit.sortOrder,
      memberCount,
      ...(unit.deletedAt ? { archivedAt: unit.deletedAt.toISOString() } : {}),
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  /**
   * Assembles the nested tree from a flat, already-ordered row set.
   *
   * A unit whose parent is absent from the set becomes a root of the result
   * rather than being dropped. That is not a tolerated inconsistency — it is
   * the correct reading of a subtree query (`rootId` returns a node whose
   * parent is deliberately outside the scope) and of a default listing whose
   * ancestor is archived. Dropping such rows would make a whole branch vanish
   * because one node above it was archived.
   */
  toTree(
    units: OrganizationUnitRecord[],
    memberCountByUnitId: Map<string, number>,
  ): OrganizationUnitTreeResponse {
    const nodesById = new Map<string, OrganizationUnitTreeNode>();
    for (const unit of units) {
      nodesById.set(unit.id, {
        ...this.toResponse(unit, memberCountByUnitId.get(unit.id) ?? 0),
        children: [],
      });
    }
    const roots: OrganizationUnitTreeNode[] = [];
    for (const unit of units) {
      const node = nodesById.get(unit.id);
      if (!node) {
        continue;
      }
      const parent = unit.parentId ? nodesById.get(unit.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
        continue;
      }
      roots.push(node);
    }
    const maxDepth = units.reduce(
      (deepest, unit) => Math.max(deepest, this.resolveDepth(unit.path)),
      0,
    );

    return { roots, totalUnits: units.length, maxDepth };
  }
}
