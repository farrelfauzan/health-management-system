import { OrganizationUnitMemberRecord, OrganizationUnitRecord } from '@hms/shared-types';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { OrganizationUnitMemberRepository } from '../repository/organization-unit-member.repository';
import { OrganizationUnitRepository } from '../repository/organization-unit.repository';
import { OrganizationUnitMemberService } from './organization-unit-member.service';

describe('OrganizationUnitMemberService', () => {
  const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
  const UNIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const OTHER_UNIT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const MEMBER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

  function buildUnit(overrides: Partial<OrganizationUnitRecord> = {}): OrganizationUnitRecord {
    return {
      id: UNIT_ID,
      parentId: null,
      name: 'Nursing',
      kind: 'DEPARTMENT',
      path: `/${UNIT_ID}/`,
      sortOrder: 0,
      createdAt: new Date('2026-09-08T00:00:00.000Z'),
      updatedAt: new Date('2026-09-08T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  function buildMember(
    overrides: Partial<OrganizationUnitMemberRecord> = {},
  ): OrganizationUnitMemberRecord {
    return {
      userId: MEMBER_USER_ID,
      email: 'maya.sari@clinic.local',
      isActive: true,
      roles: ['DOCTOR'],
      organizationUnitId: null,
      ...overrides,
    };
  }

  function buildService() {
    const mockMemberRepository = {
      listMembers: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
      findLiveMemberById: jest.fn().mockResolvedValue(buildMember()),
      assignMember: jest.fn().mockResolvedValue(undefined),
      unassignMember: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrganizationUnitMemberRepository>;
    const mockUnitRepository = {
      findLiveUnitById: jest.fn().mockResolvedValue(buildUnit()),
      findUnitById: jest.fn().mockResolvedValue(buildUnit()),
    } as unknown as jest.Mocked<OrganizationUnitRepository>;
    const mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    const service = new OrganizationUnitMemberService(
      mockMemberRepository,
      mockUnitRepository,
      mockAuditService,
    );

    return { service, mockMemberRepository, mockUnitRepository, mockAuditService };
  }

  describe('listMembers', () => {
    it('reads the roster of an archived unit', async () => {
      // "Who is still in the unit we just wound down" is exactly when this
      // question gets asked, so the read path does not require a live unit.
      const { service, mockUnitRepository, mockMemberRepository } = buildService();
      mockUnitRepository.findUnitById.mockResolvedValue(buildUnit({ deletedAt: new Date() }));
      mockMemberRepository.listMembers.mockResolvedValue({
        items: [buildMember({ organizationUnitId: UNIT_ID })],
        page: 1,
        limit: 20,
        total: 1,
      });

      const actual = await service.listMembers(UNIT_ID, { page: 1, limit: 20 });

      expect(actual.items).toHaveLength(1);
      expect(actual.meta).toEqual({ page: 1, limit: 20, total: 1 });
    });

    it('rejects a unit that does not exist', async () => {
      const { service, mockUnitRepository } = buildService();
      mockUnitRepository.findUnitById.mockResolvedValue(null);

      await expect(service.listMembers(UNIT_ID, { page: 1, limit: 20 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('assignMember', () => {
    it('assigns an unassigned person and records where they came from', async () => {
      const { service, mockMemberRepository, mockAuditService } = buildService();

      const actual = await service.assignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID);

      expect(actual.email).toBe('maya.sari@clinic.local');
      expect(mockMemberRepository.assignMember).toHaveBeenCalledWith(MEMBER_USER_ID, UNIT_ID);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_UNIT_MEMBER_ASSIGNED,
          metadata: {
            before: { organizationUnitId: null },
            after: { organizationUnitId: UNIT_ID },
          },
        }),
      );
    });

    it('moves someone who already sits in another unit, naming the old one', async () => {
      // A person belongs to one unit, so this is a reassignment rather than an
      // error — and the unit they came from is the half nobody looks at until
      // they need it.
      const { service, mockMemberRepository, mockAuditService } = buildService();
      mockMemberRepository.findLiveMemberById.mockResolvedValue(
        buildMember({ organizationUnitId: OTHER_UNIT_ID }),
      );

      await service.assignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID);

      expect(mockMemberRepository.assignMember).toHaveBeenCalledWith(MEMBER_USER_ID, UNIT_ID);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            before: { organizationUnitId: OTHER_UNIT_ID },
            after: { organizationUnitId: UNIT_ID },
          },
        }),
      );
    });

    it('refuses to assign into an archived unit', async () => {
      // The unit has left the chart; putting someone in it would create a
      // member nobody can see.
      const { service, mockUnitRepository, mockMemberRepository } = buildService();
      mockUnitRepository.findLiveUnitById.mockResolvedValue(null);

      await expect(
        service.assignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockMemberRepository.assignMember).not.toHaveBeenCalled();
    });

    it('refuses a soft-deleted user', async () => {
      const { service, mockMemberRepository } = buildService();
      mockMemberRepository.findLiveMemberById.mockResolvedValue(null);

      await expect(
        service.assignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockMemberRepository.assignMember).not.toHaveBeenCalled();
    });

    it('refuses a re-assignment to the unit the person is already in', async () => {
      // Not a silent no-op: an audit row claiming a move that did not happen is
      // worse than this refusal.
      const { service, mockMemberRepository, mockAuditService } = buildService();
      mockMemberRepository.findLiveMemberById.mockResolvedValue(
        buildMember({ organizationUnitId: UNIT_ID }),
      );

      await expect(
        service.assignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockMemberRepository.assignMember).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('unassignMember', () => {
    it('removes a member of the named unit', async () => {
      const { service, mockMemberRepository, mockAuditService } = buildService();
      mockMemberRepository.findLiveMemberById.mockResolvedValue(
        buildMember({ organizationUnitId: UNIT_ID }),
      );

      await service.unassignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID);

      expect(mockMemberRepository.unassignMember).toHaveBeenCalledWith(MEMBER_USER_ID);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ORGANIZATION_UNIT_MEMBER_UNASSIGNED,
          metadata: { before: { organizationUnitId: UNIT_ID } },
        }),
      );
    });

    it('refuses to remove someone from a unit they are not in', async () => {
      // Guards against a stale screen unassigning someone from a unit they had
      // already been moved out of.
      const { service, mockMemberRepository } = buildService();
      mockMemberRepository.findLiveMemberById.mockResolvedValue(
        buildMember({ organizationUnitId: OTHER_UNIT_ID }),
      );

      await expect(
        service.unassignMember(UNIT_ID, MEMBER_USER_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockMemberRepository.unassignMember).not.toHaveBeenCalled();
    });
  });
});
