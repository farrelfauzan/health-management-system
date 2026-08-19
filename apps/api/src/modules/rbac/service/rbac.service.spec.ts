import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { RbacRepository } from '../repository/rbac.repository';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const rbacRepositoryMock = {
    findActiveRoles: jest.fn(),
    findPermissionCatalog: jest.fn(),
    findPermissionsByKeys: jest.fn(),
    findRoleById: jest.fn(),
    findAnyRoleByCode: jest.fn(),
    createRole: jest.fn(),
    updateRole: jest.fn(),
    softDeleteRole: jest.fn(),
    replaceRolePermissions: jest.fn(),
    assignRole: jest.fn(),
    unassignRole: jest.fn(),
  } as unknown as RbacRepository;
  const auditServiceMock = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const service = new RbacService(rbacRepositoryMock, auditServiceMock);

  const userId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const roleId = '33333333-3333-4333-8333-333333333333';
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  const roleRecord = {
    id: roleId,
    code: 'FRONT_DESK_LEAD',
    name: 'Front Desk Lead',
    description: null,
    isSystem: false,
    createdAt,
    updatedAt: createdAt,
  };
  const patientReadPermission = {
    id: 'perm-1',
    permissionKey: 'patient.read:any',
    resource: 'Patient',
    action: 'read',
    scope: 'ANY' as const,
    description: 'Read all patients',
  };
  const roleWithPermissions = {
    ...roleRecord,
    memberCount: 2,
    permissions: [patientReadPermission],
  };
  const systemRole = { ...roleWithPermissions, id: 'sys-1', code: 'SUPER_ADMIN', isSystem: true };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active roles as summaries with null descriptions dropped', async () => {
    (rbacRepositoryMock.findActiveRoles as jest.Mock).mockResolvedValue([roleRecord]);
    const actualRoles = await service.getRoles();
    expect(actualRoles).toEqual([
      { id: roleId, code: 'FRONT_DESK_LEAD', name: 'Front Desk Lead', isSystem: false },
    ]);
  });

  it('groups the permission catalog by resource preserving catalog order', async () => {
    (rbacRepositoryMock.findPermissionCatalog as jest.Mock).mockResolvedValue([
      { ...patientReadPermission, resource: 'Appointment', permissionKey: 'appointment.read:any' },
      patientReadPermission,
      {
        ...patientReadPermission,
        id: 'perm-2',
        permissionKey: 'patient.update:any',
        action: 'update',
      },
    ]);
    const actualGroups = await service.getPermissionCatalog();
    expect(actualGroups.map((group) => group.resource)).toEqual(['Appointment', 'Patient']);
    expect(actualGroups[1]?.permissions.map((permission) => permission.permissionKey)).toEqual([
      'patient.read:any',
      'patient.update:any',
    ]);
  });

  it('returns a role detail with ISO timestamps and member count', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    const actualRole = await service.getRoleById(roleId);
    expect(actualRole).toEqual({
      id: roleId,
      code: 'FRONT_DESK_LEAD',
      name: 'Front Desk Lead',
      isSystem: false,
      memberCount: 2,
      permissions: [patientReadPermission],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('throws NotFound for an unknown role id', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(null);
    await expect(service.getRoleById(roleId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a custom role when the code is free', async () => {
    (rbacRepositoryMock.findAnyRoleByCode as jest.Mock).mockResolvedValue(null);
    (rbacRepositoryMock.createRole as jest.Mock).mockResolvedValue(roleRecord);
    const inputRole = { code: 'FRONT_DESK_LEAD', name: 'Front Desk Lead' };
    const actualRole = await service.createRole(inputRole, actorId);
    expect(rbacRepositoryMock.createRole).toHaveBeenCalledWith(inputRole);
    expect(actualRole.isSystem).toBe(false);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_CREATED,
        resource: 'role',
        actorUserId: actorId,
        resourceId: roleId,
      }),
    );
  });

  it('rejects a duplicate role code with Conflict, including soft-deleted codes', async () => {
    (rbacRepositoryMock.findAnyRoleByCode as jest.Mock).mockResolvedValue({
      id: roleId,
      deletedAt: createdAt,
    });
    await expect(
      service.createRole({ code: 'FRONT_DESK_LEAD', name: 'Front Desk Lead' }, actorId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rbacRepositoryMock.createRole).not.toHaveBeenCalled();
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('updates an existing role', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    (rbacRepositoryMock.updateRole as jest.Mock).mockResolvedValue({
      ...roleRecord,
      name: 'Desk Lead',
    });
    const actualRole = await service.updateRole(roleId, { name: 'Desk Lead' }, actorId);
    expect(rbacRepositoryMock.updateRole).toHaveBeenCalledWith(roleId, { name: 'Desk Lead' });
    expect(actualRole.name).toBe('Desk Lead');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_UPDATED,
        resourceId: roleId,
        metadata: expect.objectContaining({
          before: { name: 'Front Desk Lead', description: null },
          after: { name: 'Desk Lead', description: null },
        }),
      }),
    );
  });

  it('refuses to update, delete, or re-permission a system role', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(systemRole);
    await expect(service.updateRole('sys-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.deleteRole('sys-1', actorId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.setRolePermissions('sys-1', { permissionKeys: [] }, actorId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rbacRepositoryMock.updateRole).not.toHaveBeenCalled();
    expect(rbacRepositoryMock.softDeleteRole).not.toHaveBeenCalled();
    expect(rbacRepositoryMock.replaceRolePermissions).not.toHaveBeenCalled();
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('soft-deletes a role and reports revoked assignments', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    (rbacRepositoryMock.softDeleteRole as jest.Mock).mockResolvedValue({
      id: roleId,
      code: 'FRONT_DESK_LEAD',
      deletedAt: createdAt,
      revokedAssignmentCount: 2,
    });
    const actualResult = await service.deleteRole(roleId, actorId);
    expect(rbacRepositoryMock.softDeleteRole).toHaveBeenCalledWith(roleId, actorId);
    expect(actualResult).toEqual({
      id: roleId,
      code: 'FRONT_DESK_LEAD',
      deletedAt: '2026-01-01T00:00:00.000Z',
      revokedAssignmentCount: 2,
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_DELETED,
        resourceId: roleId,
        metadata: { roleCode: 'FRONT_DESK_LEAD', revokedAssignmentCount: 2 },
      }),
    );
  });

  it('replaces the permission set with de-duplicated known keys', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    (rbacRepositoryMock.findPermissionsByKeys as jest.Mock).mockResolvedValue([
      patientReadPermission,
    ]);
    await service.setRolePermissions(
      roleId,
      { permissionKeys: ['patient.read:any', 'patient.read:any'] },
      actorId,
    );
    expect(rbacRepositoryMock.findPermissionsByKeys).toHaveBeenCalledWith(['patient.read:any']);
    expect(rbacRepositoryMock.replaceRolePermissions).toHaveBeenCalledWith({
      roleId,
      permissionIds: ['perm-1'],
    });
  });

  it('audits the permission diff, not just the final set', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    const appointmentRead = {
      ...patientReadPermission,
      id: 'perm-3',
      permissionKey: 'appointment.read:any',
    };
    (rbacRepositoryMock.findPermissionsByKeys as jest.Mock).mockResolvedValue([appointmentRead]);
    await service.setRolePermissions(roleId, { permissionKeys: ['appointment.read:any'] }, actorId);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROLE_PERMISSIONS_CHANGED,
        resourceId: roleId,
        metadata: {
          roleCode: 'FRONT_DESK_LEAD',
          added: ['appointment.read:any'],
          removed: ['patient.read:any'],
        },
      }),
    );
  });

  it('rejects unknown permission keys without touching the role', async () => {
    (rbacRepositoryMock.findRoleById as jest.Mock).mockResolvedValue(roleWithPermissions);
    (rbacRepositoryMock.findPermissionsByKeys as jest.Mock).mockResolvedValue([
      patientReadPermission,
    ]);
    await expect(
      service.setRolePermissions(
        roleId,
        { permissionKeys: ['patient.read:any', 'galaxy.destroy:any'] },
        actorId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rbacRepositoryMock.replaceRolePermissions).not.toHaveBeenCalled();
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
