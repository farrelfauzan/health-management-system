import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { RbacRepository } from '../repository/rbac.repository';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const rbacRepositoryMock = {
    findActiveRoles: jest.fn(),
    assignRole: jest.fn(),
    unassignRole: jest.fn(),
  } as unknown as RbacRepository;
  const auditServiceMock = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const service = new RbacService(rbacRepositoryMock, auditServiceMock);

  const userId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active roles from the repository', async () => {
    const expectedRoles = [{ id: 'role-1', code: 'ADMIN', name: 'Administrator' }];
    (rbacRepositoryMock.findActiveRoles as jest.Mock).mockResolvedValue(expectedRoles);
    const actualRoles = await service.getRoles();
    expect(actualRoles).toEqual(expectedRoles);
  });

  it('assigns a role and records an audit event', async () => {
    const expectedAssignment = { id: 'ur-1', userId, roleId: 'role-1' };
    (rbacRepositoryMock.assignRole as jest.Mock).mockResolvedValue(expectedAssignment);
    const actualAssignment = await service.assignRole(userId, 'ADMIN', actorId);
    expect(actualAssignment).toEqual(expectedAssignment);
    expect(rbacRepositoryMock.assignRole).toHaveBeenCalledWith(userId, 'ADMIN', actorId);
    expect(auditServiceMock.record).toHaveBeenCalledWith({
      action: AuditAction.ROLE_ASSIGNED,
      resource: 'user-role',
      actorUserId: actorId,
      resourceId: userId,
      metadata: { roleCode: 'ADMIN' },
    });
  });

  it('unassigns a role and records an audit event', async () => {
    const expectedUnassignment = { id: 'ur-1', userId, roleId: 'role-1' };
    (rbacRepositoryMock.unassignRole as jest.Mock).mockResolvedValue(expectedUnassignment);
    const actualUnassignment = await service.unassignRole(userId, 'ADMIN', actorId);
    expect(actualUnassignment).toEqual(expectedUnassignment);
    expect(auditServiceMock.record).toHaveBeenCalledWith({
      action: AuditAction.ROLE_UNASSIGNED,
      resource: 'user-role',
      actorUserId: actorId,
      resourceId: userId,
      metadata: { roleCode: 'ADMIN' },
    });
  });
});
