import { ForbiddenException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { AdminManagementRepository } from '../repository/admin-management.repository';
import { AdminManagementService } from './admin-management.service';

function buildActorWithRoleCodes(roleCodes: string[]): {
  roles: Array<{ role: { code: string } }>;
} {
  return {
    roles: roleCodes.map((code) => ({ role: { code } })),
  };
}

describe('AdminManagementService', () => {
  const adminManagementRepositoryMock = {
    listUsers: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveUserByEmail: jest.fn(),
    findActiveRolesByCodes: jest.fn(),
    createUserWithRoles: jest.fn(),
    updateUserWithRoles: jest.fn(),
  } as unknown as AdminManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const auditServiceMock = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const service = new AdminManagementService(
    adminManagementRepositoryMock,
    authRepositoryMock,
    auditServiceMock,
  );

  const currentUserId = '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8';

  const createPayload = {
    email: 'new-admin@hms.local',
    password: 'password123',
    isActive: true,
    roleCodes: ['SUPER_ADMIN'],
  };

  const persistedUser = {
    id: '3a6d785d-f729-4af2-b415-30f96439dad0',
    email: 'new-admin@hms.local',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    roles: [{ role: { code: 'SUPER_ADMIN', name: 'Super Admin' } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards role and status filters to the repository and maps the list result', async () => {
    (adminManagementRepositoryMock.listUsers as jest.Mock).mockResolvedValue({
      items: [persistedUser],
      total: 1,
      page: 1,
      limit: 10,
    });

    const inputQuery = { page: 1, limit: 10, search: 'admin', roleCode: 'ADMIN', isActive: true };
    const actualResult = await service.listUsers(inputQuery);

    expect(adminManagementRepositoryMock.listUsers).toHaveBeenCalledWith(inputQuery);
    expect(actualResult.items).toEqual([
      expect.objectContaining({
        id: persistedUser.id,
        email: persistedUser.email,
        roles: [{ code: 'SUPER_ADMIN', name: 'Super Admin' }],
      }),
    ]);
    expect(actualResult.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('denies assigning SUPER_ADMIN on create when actor is not a super admin', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActorWithRoleCodes(['ADMIN']),
    );

    await expect(service.createAdminUser(createPayload, currentUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(adminManagementRepositoryMock.createUserWithRoles).not.toHaveBeenCalled();
  });

  it('denies assigning SUPER_ADMIN on update when actor is not a super admin', async () => {
    (adminManagementRepositoryMock.findActiveUserById as jest.Mock).mockResolvedValue(persistedUser);
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActorWithRoleCodes(['ADMIN']),
    );

    await expect(
      service.updateAdminUser(persistedUser.id, { roleCodes: ['SUPER_ADMIN'] }, currentUserId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adminManagementRepositoryMock.updateUserWithRoles).not.toHaveBeenCalled();
  });

  it('allows assigning SUPER_ADMIN when actor is a super admin', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActorWithRoleCodes(['SUPER_ADMIN']),
    );
    (adminManagementRepositoryMock.findActiveUserByEmail as jest.Mock).mockResolvedValue(null);
    (adminManagementRepositoryMock.findActiveRolesByCodes as jest.Mock).mockResolvedValue([
      { id: 'role-super-admin', code: 'SUPER_ADMIN' },
    ]);
    (adminManagementRepositoryMock.createUserWithRoles as jest.Mock).mockResolvedValue(persistedUser);

    const actualUser = await service.createAdminUser(createPayload, currentUserId);

    expect(actualUser.roles).toEqual([{ code: 'SUPER_ADMIN', name: 'Super Admin' }]);
    expect(adminManagementRepositoryMock.createUserWithRoles).toHaveBeenCalledWith(
      expect.objectContaining({ roleIds: ['role-super-admin'] }),
    );
  });

  it('does not query the actor when no privileged role is requested', async () => {
    (adminManagementRepositoryMock.findActiveUserByEmail as jest.Mock).mockResolvedValue(null);
    (adminManagementRepositoryMock.findActiveRolesByCodes as jest.Mock).mockResolvedValue([
      { id: 'role-admin', code: 'ADMIN' },
    ]);
    (adminManagementRepositoryMock.createUserWithRoles as jest.Mock).mockResolvedValue({
      ...persistedUser,
      roles: [{ role: { code: 'ADMIN', name: 'Admin' } }],
    });

    await service.createAdminUser({ ...createPayload, roleCodes: ['ADMIN'] }, currentUserId);

    expect(authRepositoryMock.findUserById).not.toHaveBeenCalled();
  });
});
