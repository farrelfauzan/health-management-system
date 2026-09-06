import { UnauthorizedException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { ManagedDocumentAccessService } from './managed-document-access.service';

type PermissionSeed = { resource: string; action: string; scope: 'ANY' | 'OWN' };

describe('ManagedDocumentAccessService', () => {
  const actor = { sub: 'user-1', email: 'admin@hms.local' } as CurrentUser;
  const authRepositoryMock = { findUserById: jest.fn() };
  const service = new ManagedDocumentAccessService(authRepositoryMock as unknown as AuthRepository);

  function mockActor(permissions: PermissionSeed[]): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'user-1',
      roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads each source gate from the ANY grants the caller holds', async () => {
    mockActor([
      { resource: 'ManagedDocument', action: 'read', scope: 'ANY' },
      { resource: 'Invoice', action: 'read', scope: 'ANY' },
      { resource: 'Document', action: 'read', scope: 'OWN' },
    ]);

    const actual = await service.resolveContext(actor);

    expect(actual).toEqual({
      userId: 'user-1',
      canReadInvoices: true,
      canReadTemplates: false,
      // An OWN grant on the store is a personal knowledge base, not the
      // clinic corpus — it opens nothing here beyond the owner branch.
      canReadClinicCorpus: false,
      canReadPatientDocuments: false,
    });
  });

  it('treats the catalog-wide manage grant as every gate open', async () => {
    mockActor([{ resource: 'all', action: 'manage', scope: 'ANY' }]);

    const actual = await service.resolveContext(actor);

    expect(actual).toMatchObject({
      canReadInvoices: true,
      canReadTemplates: true,
      canReadClinicCorpus: true,
      canReadPatientDocuments: true,
    });
  });

  it('refuses an actor the auth repository no longer knows', async () => {
    authRepositoryMock.findUserById.mockResolvedValue(null);

    await expect(service.resolveContext(actor)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
