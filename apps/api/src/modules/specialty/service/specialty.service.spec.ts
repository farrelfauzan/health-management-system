import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { SpecialtyRepository } from '../repository/specialty.repository';
import { SpecialtyService } from './specialty.service';

describe('SpecialtyService', () => {
  const specialtyId = '0b6c2d9e-4f1a-4c3b-9a7e-5d8f1e2a3b4c';
  const currentUser = { sub: 'admin-user' } as CurrentUser;
  const storedSpecialty = {
    id: specialtyId,
    name: 'Obstetrics & Gynecology',
    description: null,
    isActive: true,
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    updatedAt: new Date('2026-09-25T00:00:00.000Z'),
  };
  const repositoryMock = {
    listSpecialties: jest.fn(),
    findSpecialtyById: jest.fn(),
    findSpecialtyByName: jest.fn(),
    createSpecialty: jest.fn(),
    updateSpecialty: jest.fn(),
    countActiveUsage: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };
  const service = new SpecialtyService(
    repositoryMock as unknown as SpecialtyRepository,
    auditServiceMock as unknown as AuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findSpecialtyById.mockResolvedValue(storedSpecialty);
    repositoryMock.findSpecialtyByName.mockResolvedValue(null);
    repositoryMock.countActiveUsage.mockResolvedValue({
      activeClinicianCount: 0,
      activeTariffCount: 0,
    });
    repositoryMock.createSpecialty.mockImplementation(async (payload) => ({
      ...storedSpecialty,
      id: 'new-poli',
      ...payload,
    }));
    repositoryMock.updateSpecialty.mockImplementation(async (_id, payload) => ({
      ...storedSpecialty,
      ...payload,
    }));
  });

  describe('createSpecialty', () => {
    it('adds a poli and audits it', async () => {
      const actual = await service.createSpecialty({ name: 'Kebidanan' }, currentUser);

      expect(actual).toMatchObject({ id: 'new-poli', name: 'Kebidanan', isActive: true });
      expect(repositoryMock.createSpecialty).toHaveBeenCalledWith({
        name: 'Kebidanan',
        description: null,
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', resource: 'Specialty', resourceId: 'new-poli' }),
      );
    });

    it('refuses a name another poli already carries', async () => {
      repositoryMock.findSpecialtyByName.mockResolvedValue({ id: 'other' });

      const actualError = await service
        .createSpecialty({ name: 'kebidanan' }, currentUser)
        .catch((error: unknown) => error);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect((actualError as ConflictException).getResponse()).toMatchObject({
        code: 'SPECIALTY_NAME_TAKEN',
      });
      expect(repositoryMock.createSpecialty).not.toHaveBeenCalled();
    });
  });

  describe('updateSpecialty', () => {
    it('renames a poli', async () => {
      const actual = await service.updateSpecialty(specialtyId, { name: 'Poli Kandungan' }, currentUser);

      expect(actual.name).toBe('Poli Kandungan');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          metadata: expect.objectContaining({
            name: { from: 'Obstetrics & Gynecology', to: 'Poli Kandungan' },
          }),
        }),
      );
    });

    it('lets a rename change only the case without tripping the uniqueness check', async () => {
      await service.updateSpecialty(specialtyId, { name: 'OBSTETRICS & GYNECOLOGY' }, currentUser);

      expect(repositoryMock.findSpecialtyByName).not.toHaveBeenCalled();
    });

    it('refuses a rename onto a name another poli carries', async () => {
      repositoryMock.findSpecialtyByName.mockResolvedValue({ id: 'other' });

      await expect(
        service.updateSpecialty(specialtyId, { name: 'Kebidanan' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositoryMock.updateSpecialty).not.toHaveBeenCalled();
    });

    it('deactivates a poli nothing active depends on', async () => {
      const actual = await service.updateSpecialty(specialtyId, { isActive: false }, currentUser);

      expect(actual.isActive).toBe(false);
      expect(repositoryMock.countActiveUsage).toHaveBeenCalledWith(specialtyId);
    });

    it('refuses to deactivate a poli an active clinician or tariff still uses', async () => {
      repositoryMock.countActiveUsage.mockResolvedValue({
        activeClinicianCount: 2,
        activeTariffCount: 1,
      });

      const actualError = await service
        .updateSpecialty(specialtyId, { isActive: false }, currentUser)
        .catch((error: unknown) => error);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect((actualError as ConflictException).getResponse()).toMatchObject({
        code: 'SPECIALTY_IN_USE',
        errors: { activeClinicianCount: 2, activeTariffCount: 1 },
      });
      expect(repositoryMock.updateSpecialty).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('reactivates without counting usage', async () => {
      repositoryMock.findSpecialtyById.mockResolvedValue({ ...storedSpecialty, isActive: false });

      const actual = await service.updateSpecialty(specialtyId, { isActive: true }, currentUser);

      expect(actual.isActive).toBe(true);
      expect(repositoryMock.countActiveUsage).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown poli', async () => {
      repositoryMock.findSpecialtyById.mockResolvedValue(null);

      await expect(
        service.updateSpecialty(specialtyId, { name: 'Kebidanan' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
