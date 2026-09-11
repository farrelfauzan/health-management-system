import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';
import { DoctorManagementService } from './doctor-management.service';
import { DoctorProfileCompletionService } from './doctor-profile-completion.service';

describe('DoctorProfileCompletionService (P20-T02)', () => {
  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const specialtyId = '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111';
  const currentUser = { sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8', email: 'dr.new@clinic.local' };
  const inputNik = '3173011503800031';

  const repositoryMock = {
    findDoctorByOwnerUserId: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorByLicenseNumber: jest.fn(),
    findDoctorByNik: jest.fn(),
    findActiveSpecialtyById: jest.fn(),
    createDoctor: jest.fn(),
    updateDoctor: jest.fn(),
  } as unknown as DoctorManagementRepository;

  const doctorManagementServiceMock = {
    getDoctorById: jest.fn(),
  } as unknown as DoctorManagementService;

  const credentialOptionServiceMock = {
    assertUsableCodes: jest.fn(),
  } as unknown as DoctorCredentialOptionService;

  const auditServiceMock = { record: jest.fn() } as unknown as AuditService;

  const authRepositoryMock = { findUserById: jest.fn() } as unknown as AuthRepository;

  const service = new DoctorProfileCompletionService(
    repositoryMock,
    doctorManagementServiceMock,
    credentialOptionServiceMock,
    auditServiceMock,
    authRepositoryMock,
  );

  function buildActor(roleCode: string, unassignedAt: Date | null = null) {
    return { roles: [{ unassignedAt, role: { code: roleCode, permissions: [] } }] };
  }

  const creationPayload = {
    fullName: 'Dr. New Arrival',
    phoneNumber: '628129876500',
    specialtyId,
    licenseNumber: 'STR-33-2020-000999',
    nik: inputNik,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(buildActor('DOCTOR'));
    (repositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);
    (repositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (repositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue(null);
    (repositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({ id: specialtyId });
    (repositoryMock.createDoctor as jest.Mock).mockResolvedValue({ id: doctorId });
    (doctorManagementServiceMock.getDoctorById as jest.Mock).mockResolvedValue({ id: doctorId });
  });

  it('refuses anyone who does not actively hold DOCTOR', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(buildActor('PHARMACIST'));

    await expect(
      service.completeOwnDoctorProfile(creationPayload, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.createDoctor).not.toHaveBeenCalled();
  });

  it('refuses a DOCTOR role that has been unassigned', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor('DOCTOR', new Date('2026-09-01T00:00:00.000Z')),
    );

    await expect(
      service.completeOwnDoctorProfile(creationPayload, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('an invited doctor with no profile', () => {
    it('creates the profile, owned by them, and audits it as their own completion', async () => {
      const actualProfile = await service.completeOwnDoctorProfile(creationPayload, currentUser);

      expect(repositoryMock.createDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Dr. New Arrival',
          specialtyId,
          licenseNumber: 'STR-33-2020-000999',
          nik: inputNik,
          ownerUserId: currentUser.sub,
          actorUserId: currentUser.sub,
          isActive: true,
        }),
      );
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resource: 'DoctorProfile',
          resourceId: doctorId,
          actorUserId: currentUser.sub,
          metadata: expect.objectContaining({ scope: 'OWN', completion: true }),
        }),
      );
      expect(actualProfile).toEqual({ id: doctorId });
    });

    it('names every credential still missing instead of creating a half profile', async () => {
      const actualError = await service
        .completeOwnDoctorProfile({ fullName: 'Dr. New', phoneNumber: '628129876500' }, currentUser)
        .catch((error: unknown) => error);

      expect(actualError).toBeInstanceOf(BadRequestException);
      expect((actualError as BadRequestException).getResponse()).toMatchObject({
        code: 'DOCTOR_PROFILE_FIELDS_REQUIRED',
        errors: { specialtyId: 'Required', licenseNumber: 'Required', nik: 'Required' },
      });
      expect(repositoryMock.createDoctor).not.toHaveBeenCalled();
    });

    it('refuses an STR number that already belongs to another doctor', async () => {
      (repositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue({ id: 'other' });

      await expect(
        service.completeOwnDoctorProfile(creationPayload, currentUser),
      ).rejects.toMatchObject({ response: { code: 'DOCTOR_LICENSE_TAKEN' } });
    });

    it('refuses a NIK that already belongs to another doctor', async () => {
      (repositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue({ id: 'other' });

      await expect(
        service.completeOwnDoctorProfile(creationPayload, currentUser),
      ).rejects.toMatchObject({ response: { code: 'DOCTOR_NIK_TAKEN' } });
    });
  });

  describe('a profile the clinic started', () => {
    const storedDoctor = {
      id: doctorId,
      specialtyId,
      licenseNumber: 'STR-33-2020-000123',
      nikLast4: null,
      title: null,
      degrees: null,
    };

    beforeEach(() => {
      (repositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue({ id: doctorId });
      (repositoryMock.findDoctorById as jest.Mock).mockResolvedValue(storedDoctor);
    });

    it('fills in the empty NIK and their own fields, and nothing the clinic set', async () => {
      await service.completeOwnDoctorProfile(
        { fullName: 'Dr. Started', phoneNumber: '628129876500', nik: inputNik },
        currentUser,
      );

      expect(repositoryMock.createDoctor).not.toHaveBeenCalled();
      expect(repositoryMock.updateDoctor).toHaveBeenCalledWith(doctorId, {
        fullName: 'Dr. Started',
        phoneNumber: '628129876500',
        title: undefined,
        degrees: undefined,
        nik: inputNik,
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          metadata: expect.objectContaining({ completion: true }),
        }),
      );
    });

    it('refuses to change a specialty the clinic already set', async () => {
      await expect(
        service.completeOwnDoctorProfile(
          {
            fullName: 'Dr. Started',
            phoneNumber: '628129876500',
            specialtyId: '1a2dcc2a-9b5b-4cc1-8b6f-3ea508b4d222',
          },
          currentUser,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'DOCTOR_PROFILE_FIELD_LOCKED',
          errors: { specialtyId: expect.any(String) },
        },
      });
      expect(repositoryMock.updateDoctor).not.toHaveBeenCalled();
    });

    it('refuses a different NIK once one is on file, and ignores the same one', async () => {
      (repositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
        ...storedDoctor,
        nikLast4: '0031',
      });

      await expect(
        service.completeOwnDoctorProfile(
          { fullName: 'Dr. Started', phoneNumber: '628129876500', nik: '3173011503800099' },
          currentUser,
        ),
      ).rejects.toMatchObject({ response: { code: 'DOCTOR_PROFILE_FIELD_LOCKED' } });

      (repositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue({ id: doctorId });
      await service.completeOwnDoctorProfile(
        { fullName: 'Dr. Started', phoneNumber: '628129876500', nik: inputNik },
        currentUser,
      );
      expect(repositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({ nik: undefined }),
      );
    });
  });
});
