import { OrganizationUnitRecord } from '@hms/shared-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { OrganizationUnitRepository } from '../repository/organization-unit.repository';
import { OrganizationUnitMapper } from './organization-unit.mapper';
import { OrganizationUnitService } from './organization-unit.service';

describe('OrganizationUnitService', () => {
  const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
  const ROOT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const CHILD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const GRANDCHILD_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const OTHER_ROOT_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

  function buildUnit(overrides: Partial<OrganizationUnitRecord>): OrganizationUnitRecord {
    return {
      id: ROOT_ID,
      parentId: null,
      name: 'Clinical Services',
      kind: 'DIVISION',
      path: `/${ROOT_ID}/`,
      sortOrder: 0,
      createdAt: new Date('2026-09-08T00:00:00.000Z'),
      updatedAt: new Date('2026-09-08T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  /** A chain `depth` levels deep, each unit the child of the one before it. */
  function buildChain(depth: number): OrganizationUnitRecord[] {
    const units: OrganizationUnitRecord[] = [];
    let path = '/';
    for (let level = 1; level <= depth; level += 1) {
      const id = `eeeeeeee-eeee-4eee-8eee-${level.toString().padStart(12, '0')}`;
      path = `${path}${id}/`;
      units.push(
        buildUnit({
          id,
          parentId: level === 1 ? null : (units[level - 2]?.id ?? null),
          name: `Level ${level}`,
          path,
        }),
      );
    }
    return units;
  }

  function buildService() {
    const mockRepository = {
      listUnits: jest.fn().mockResolvedValue([]),
      findLiveUnitById: jest.fn(),
      findUnitById: jest.fn(),
      listSubtree: jest.fn().mockResolvedValue([]),
      countLiveChildren: jest.fn().mockResolvedValue(0),
      countMembers: jest.fn().mockResolvedValue(0),
      tallyMembersByUnit: jest.fn().mockResolvedValue([]),
      createUnitWithSelfPath: jest.fn(),
      updateUnit: jest.fn(),
      moveUnit: jest.fn(),
      archiveUnit: jest.fn(),
      deleteUnit: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrganizationUnitRepository>;
    const mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    const service = new OrganizationUnitService(
      mockRepository,
      new OrganizationUnitMapper(),
      mockAuditService,
    );

    return { service, mockRepository, mockAuditService };
  }

  describe('getTree', () => {
    it('nests children under their parent and counts members per unit', async () => {
      const { service, mockRepository } = buildService();
      const root = buildUnit({});
      const child = buildUnit({
        id: CHILD_ID,
        parentId: ROOT_ID,
        name: 'Nursing',
        kind: 'DEPARTMENT',
        path: `/${ROOT_ID}/${CHILD_ID}/`,
      });
      mockRepository.listUnits.mockResolvedValue([root, child]);
      mockRepository.tallyMembersByUnit.mockResolvedValue([
        { organizationUnitId: CHILD_ID, count: 11 },
      ]);

      const actual = await service.getTree({});

      expect(actual.roots).toHaveLength(1);
      expect(actual.roots[0]?.id).toBe(ROOT_ID);
      expect(actual.roots[0]?.memberCount).toBe(0);
      expect(actual.roots[0]?.children[0]?.id).toBe(CHILD_ID);
      expect(actual.roots[0]?.children[0]?.memberCount).toBe(11);
      expect(actual.roots[0]?.children[0]?.depth).toBe(2);
      expect(actual.totalUnits).toBe(2);
      expect(actual.maxDepth).toBe(2);
    });

    it('surfaces a unit whose parent is out of scope as a root rather than dropping it', async () => {
      // A subtree query returns a node whose parent is deliberately outside the
      // result, and an archived ancestor does the same in a default listing.
      // Dropping such rows would make a whole branch vanish.
      const { service, mockRepository } = buildService();
      const orphan = buildUnit({
        id: CHILD_ID,
        parentId: ROOT_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/`,
      });
      mockRepository.listUnits.mockResolvedValue([orphan]);

      const actual = await service.getTree({ rootId: CHILD_ID });

      expect(actual.roots.map((node) => node.id)).toEqual([CHILD_ID]);
    });
  });

  describe('createUnit', () => {
    it('creates a root when no parent is given', async () => {
      const { service, mockRepository, mockAuditService } = buildService();
      mockRepository.createUnitWithSelfPath.mockResolvedValue(buildUnit({}));

      const actual = await service.createUnit(
        { name: 'Clinical Services', kind: 'DIVISION' },
        ACTOR_USER_ID,
      );

      expect(actual.parentId).toBeNull();
      expect(actual.depth).toBe(1);
      expect(mockRepository.createUnitWithSelfPath).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: null }),
        '/',
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.ORGANIZATION_UNIT_CREATED }),
      );
    });

    it('rejects a parent that does not exist', async () => {
      const { service, mockRepository } = buildService();
      mockRepository.findLiveUnitById.mockResolvedValue(null);

      await expect(
        service.createUnit({ name: 'Nursing', kind: 'TEAM', parentId: ROOT_ID }, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a create that would sit past the depth cap', async () => {
      const { service, mockRepository } = buildService();
      const deepest = buildChain(6).at(-1);
      mockRepository.findLiveUnitById.mockResolvedValue(deepest ?? null);

      await expect(
        service.createUnit(
          { name: 'Too deep', kind: 'TEAM', parentId: deepest?.id },
          ACTOR_USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.createUnitWithSelfPath).not.toHaveBeenCalled();
    });
  });

  describe('moveUnit', () => {
    it('re-paths the whole subtree under the new parent', async () => {
      const { service, mockRepository, mockAuditService } = buildService();
      const child = buildUnit({
        id: CHILD_ID,
        parentId: ROOT_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/`,
      });
      const grandchild = buildUnit({
        id: GRANDCHILD_ID,
        parentId: CHILD_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/${GRANDCHILD_ID}/`,
      });
      const destination = buildUnit({ id: OTHER_ROOT_ID, path: `/${OTHER_ROOT_ID}/` });
      mockRepository.findLiveUnitById.mockImplementation((id: string) =>
        Promise.resolve(id === CHILD_ID ? child : destination),
      );
      mockRepository.listSubtree.mockResolvedValue([child, grandchild]);
      mockRepository.moveUnit.mockResolvedValue({
        ...child,
        parentId: OTHER_ROOT_ID,
        path: `/${OTHER_ROOT_ID}/${CHILD_ID}/`,
      });

      await service.moveUnit(CHILD_ID, { parentId: OTHER_ROOT_ID }, ACTOR_USER_ID);

      expect(mockRepository.moveUnit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: CHILD_ID,
          parentId: OTHER_ROOT_ID,
          pathUpdates: [
            { id: CHILD_ID, path: `/${OTHER_ROOT_ID}/${CHILD_ID}/` },
            { id: GRANDCHILD_ID, path: `/${OTHER_ROOT_ID}/${CHILD_ID}/${GRANDCHILD_ID}/` },
          ],
        }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_UNIT_MOVED,
          metadata: expect.objectContaining({ descendantsRepathed: 1 }),
        }),
      );
    });

    it('promotes a unit to a root when the new parent is null', async () => {
      const { service, mockRepository } = buildService();
      const child = buildUnit({
        id: CHILD_ID,
        parentId: ROOT_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/`,
      });
      mockRepository.findLiveUnitById.mockResolvedValue(child);
      mockRepository.listSubtree.mockResolvedValue([child]);
      mockRepository.moveUnit.mockResolvedValue({
        ...child,
        parentId: null,
        path: `/${CHILD_ID}/`,
      });

      const actual = await service.moveUnit(CHILD_ID, { parentId: null }, ACTOR_USER_ID);

      expect(actual.parentId).toBeNull();
      expect(mockRepository.moveUnit).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: null,
          pathUpdates: [{ id: CHILD_ID, path: `/${CHILD_ID}/` }],
        }),
      );
    });

    it('refuses to move a unit under itself', async () => {
      const { service, mockRepository } = buildService();
      const root = buildUnit({});
      mockRepository.findLiveUnitById.mockResolvedValue(root);

      await expect(
        service.moveUnit(ROOT_ID, { parentId: ROOT_ID }, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.moveUnit).not.toHaveBeenCalled();
    });

    it('refuses to move a unit under its own descendant', async () => {
      // The prefix test catches this at any distance, which is what the
      // database's one-hop self-parent CHECK cannot do.
      const { service, mockRepository } = buildService();
      const root = buildUnit({});
      const grandchild = buildUnit({
        id: GRANDCHILD_ID,
        parentId: CHILD_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/${GRANDCHILD_ID}/`,
      });
      mockRepository.findLiveUnitById.mockImplementation((id: string) =>
        Promise.resolve(id === ROOT_ID ? root : grandchild),
      );

      await expect(
        service.moveUnit(ROOT_ID, { parentId: GRANDCHILD_ID }, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.moveUnit).not.toHaveBeenCalled();
    });

    it('rejects a move whose deepest descendant would breach the cap', async () => {
      // The unit itself fits under the destination; its subtree does not. The
      // check has to measure the subtree's height, not just the moved node.
      const { service, mockRepository } = buildService();
      const chain = buildChain(6);
      const movingRoot = buildUnit({
        id: CHILD_ID,
        parentId: null,
        path: `/${CHILD_ID}/`,
      });
      const movingLeaf = buildUnit({
        id: GRANDCHILD_ID,
        parentId: CHILD_ID,
        path: `/${CHILD_ID}/${GRANDCHILD_ID}/`,
      });
      const destination = chain.at(-2);
      mockRepository.findLiveUnitById.mockImplementation((id: string) =>
        Promise.resolve(id === CHILD_ID ? movingRoot : (destination ?? null)),
      );
      mockRepository.listSubtree.mockResolvedValue([movingRoot, movingLeaf]);

      await expect(
        service.moveUnit(CHILD_ID, { parentId: destination?.id ?? null }, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.moveUnit).not.toHaveBeenCalled();
    });
  });

  describe('archiveUnit', () => {
    it('archives a unit that has no live children', async () => {
      const { service, mockRepository, mockAuditService } = buildService();
      mockRepository.findLiveUnitById.mockResolvedValue(buildUnit({}));
      mockRepository.archiveUnit.mockResolvedValue(buildUnit({ deletedAt: new Date() }));

      await service.archiveUnit(ROOT_ID, ACTOR_USER_ID);

      expect(mockRepository.archiveUnit).toHaveBeenCalledWith(ROOT_ID);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.ORGANIZATION_UNIT_ARCHIVED }),
      );
    });

    it('refuses to archive a unit that still has live children', async () => {
      const { service, mockRepository } = buildService();
      mockRepository.findLiveUnitById.mockResolvedValue(buildUnit({}));
      mockRepository.countLiveChildren.mockResolvedValue(2);

      await expect(service.archiveUnit(ROOT_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepository.archiveUnit).not.toHaveBeenCalled();
    });

    it('archives a unit that still has members', async () => {
      // Deliberately allowed: the row survives, so the members' foreign key
      // stays valid and nothing is lost while headcount is reassigned.
      const { service, mockRepository } = buildService();
      mockRepository.findLiveUnitById.mockResolvedValue(buildUnit({}));
      mockRepository.countMembers.mockResolvedValue(7);
      mockRepository.archiveUnit.mockResolvedValue(buildUnit({ deletedAt: new Date() }));

      await service.archiveUnit(ROOT_ID, ACTOR_USER_ID);

      expect(mockRepository.archiveUnit).toHaveBeenCalledWith(ROOT_ID);
    });
  });

  describe('deleteUnit', () => {
    it('hard deletes an empty unit', async () => {
      const { service, mockRepository, mockAuditService } = buildService();
      const unit = buildUnit({});
      mockRepository.findUnitById.mockResolvedValue(unit);
      mockRepository.listSubtree.mockResolvedValue([unit]);

      await service.deleteUnit(ROOT_ID, ACTOR_USER_ID);

      expect(mockRepository.deleteUnit).toHaveBeenCalledWith(ROOT_ID);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.ORGANIZATION_UNIT_DELETED }),
      );
    });

    it('refuses a hard delete while any sub-unit remains, archived ones included', async () => {
      const { service, mockRepository } = buildService();
      const unit = buildUnit({});
      const archivedChild = buildUnit({
        id: CHILD_ID,
        parentId: ROOT_ID,
        path: `/${ROOT_ID}/${CHILD_ID}/`,
        deletedAt: new Date(),
      });
      mockRepository.findUnitById.mockResolvedValue(unit);
      mockRepository.listSubtree.mockResolvedValue([unit, archivedChild]);

      await expect(service.deleteUnit(ROOT_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepository.deleteUnit).not.toHaveBeenCalled();
    });

    it('refuses a hard delete while members remain', async () => {
      const { service, mockRepository } = buildService();
      const unit = buildUnit({});
      mockRepository.findUnitById.mockResolvedValue(unit);
      mockRepository.listSubtree.mockResolvedValue([unit]);
      mockRepository.countMembers.mockResolvedValue(3);

      await expect(service.deleteUnit(ROOT_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepository.deleteUnit).not.toHaveBeenCalled();
    });
  });
});
