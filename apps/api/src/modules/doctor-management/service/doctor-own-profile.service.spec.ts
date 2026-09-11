import { NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';
import { DoctorManagementService } from './doctor-management.service';
import { DoctorOwnProfileService } from './doctor-own-profile.service';

describe('DoctorOwnProfileService (P20-T03)', () => {
  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'dr.first@clinic.local',
  };

  const storedDoctor = {
    id: doctorId,
    title: 'DR',
    degrees: 'SP_PD',
    ownerUserId: currentUser.sub,
  };

  const repositoryMock = {
    findDoctorByOwnerUserId: jest.fn(),
    findDoctorById: jest.fn(),
    updateDoctor: jest.fn(),
    listEducationFieldOfStudyCodes: jest.fn(),
  } as unknown as DoctorManagementRepository;

  const doctorManagementServiceMock = {
    getDoctorById: jest.fn(),
  } as unknown as DoctorManagementService;

  const credentialOptionServiceMock = {
    assertUsableCodes: jest.fn(),
  } as unknown as DoctorCredentialOptionService;

  const auditServiceMock = {
    record: jest.fn(),
  } as unknown as AuditService;

  const service = new DoctorOwnProfileService(
    repositoryMock,
    doctorManagementServiceMock,
    credentialOptionServiceMock,
    auditServiceMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (repositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue({ id: doctorId });
    (repositoryMock.findDoctorById as jest.Mock).mockResolvedValue(storedDoctor);
    (repositoryMock.listEducationFieldOfStudyCodes as jest.Mock).mockResolvedValue([]);
    (doctorManagementServiceMock.getDoctorById as jest.Mock).mockResolvedValue({
      id: doctorId,
      fullName: 'Dr. First',
    });
  });

  describe('resolveOwnDoctorProfileId', () => {
    it('answers with the profile the signed-in user owns', async () => {
      const actualId = await service.resolveOwnDoctorProfileId(currentUser.sub);

      expect(repositoryMock.findDoctorByOwnerUserId).toHaveBeenCalledWith(currentUser.sub);
      expect(actualId).toBe(doctorId);
    });

    it('gives a user with no doctor profile a clean 404 that names the reason', async () => {
      (repositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);

      await expect(service.resolveOwnDoctorProfileId(currentUser.sub)).rejects.toMatchObject({
        response: { code: 'DOCTOR_PROFILE_NOT_FOUND' },
      });
    });
  });

  it('reads the own profile in the doctor detail shape', async () => {
    const actualProfile = await service.getOwnDoctorProfile(currentUser);

    expect(doctorManagementServiceMock.getDoctorById).toHaveBeenCalledWith(doctorId, currentUser);
    expect(actualProfile).toEqual({ id: doctorId, fullName: 'Dr. First' });
  });

  describe('updateOwnDoctorProfile', () => {
    it('writes only the fields a doctor owns and audits them with the doctor as actor', async () => {
      const inputPayload = { fullName: 'Dr. First Corrected', phoneNumber: '628129876500' };

      await service.updateOwnDoctorProfile(inputPayload, currentUser);

      expect(repositoryMock.updateDoctor).toHaveBeenCalledWith(doctorId, {
        fullName: 'Dr. First Corrected',
        phoneNumber: '628129876500',
        title: undefined,
        degrees: undefined,
        educations: undefined,
      });
      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'UPDATE',
        resource: 'DoctorProfile',
        resourceId: doctorId,
        actorUserId: currentUser.sub,
        metadata: { scope: 'OWN', fields: ['fullName', 'phoneNumber'] },
      });
    });

    it('stores degrees comma-joined and checks them against the catalog, keeping stored codes usable', async () => {
      await service.updateOwnDoctorProfile({ degrees: ['SP_PD', 'M_KES'] }, currentUser);

      expect(credentialOptionServiceMock.assertUsableCodes).toHaveBeenCalledWith({
        kind: 'DEGREE',
        codes: ['SP_PD', 'M_KES'],
        field: 'degrees',
        retainedCodes: ['SP_PD'],
      });
      expect(repositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({ degrees: 'SP_PD,M_KES' }),
      );
    });

    it('clears a title without consulting the catalog', async () => {
      await service.updateOwnDoctorProfile({ title: null }, currentUser);

      expect(credentialOptionServiceMock.assertUsableCodes).not.toHaveBeenCalled();
      expect(repositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({ title: null }),
      );
    });

    it('checks education fields of study against the catalog', async () => {
      (repositoryMock.listEducationFieldOfStudyCodes as jest.Mock).mockResolvedValue([
        'PENDIDIKAN_DOKTER',
      ]);

      await service.updateOwnDoctorProfile(
        {
          educations: [
            {
              institution: 'Universitas Indonesia',
              degree: 'dr.',
              fieldOfStudy: 'PENDIDIKAN_DOKTER',
              graduationYear: 2004,
            },
          ],
        },
        currentUser,
      );

      expect(credentialOptionServiceMock.assertUsableCodes).toHaveBeenCalledWith({
        kind: 'FIELD_OF_STUDY',
        codes: ['PENDIDIKAN_DOKTER'],
        field: 'educations.fieldOfStudy',
        retainedCodes: ['PENDIDIKAN_DOKTER'],
      });
    });

    it('writes nothing for a user with no doctor profile', async () => {
      (repositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOwnDoctorProfile({ fullName: 'Nobody' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.updateDoctor).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('returns the refreshed profile', async () => {
      const actualProfile = await service.updateOwnDoctorProfile(
        { fullName: 'Dr. First' },
        currentUser,
      );

      expect(actualProfile).toEqual({ id: doctorId, fullName: 'Dr. First' });
    });
  });
});
