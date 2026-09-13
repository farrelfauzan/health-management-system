import { updateDoctorSchema } from '@hms/shared-types';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AdminManagementService } from '../../admin-management/service/admin-management.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { UserInvitationService } from '../../user-invitation/service/user-invitation.service';
import { DoctorIdentifierConflictError } from '../repository/doctor-identifier-conflict.error';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorCredentialOptionService } from './doctor-credential-option.service';
import { DoctorManagementService } from './doctor-management.service';

type PermissionScope = 'ANY' | 'OWN';

function buildActor(
  permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
): {
  roles: Array<{
    role: {
      permissions: Array<{
        permission: {
          action: string;
          resource: string;
          scope: PermissionScope;
        };
      }>;
    };
  }>;
} {
  return {
    roles: [
      {
        role: {
          permissions: permissions.map((permission) => ({
            permission,
          })),
        },
      },
    ],
  };
}

describe('DoctorManagementService', () => {
  const doctorManagementRepositoryMock = {
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetailById: jest.fn(),
    findDoctorByNik: jest.fn(),
    findDoctorByLicenseNumber: jest.fn(),
    findDoctorByOwnerUserId: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveSpecialtyById: jest.fn(),
    findActivePatientsByIds: jest.fn(),
    findDoctorIdentifiers: jest.fn(),
    createDoctor: jest.fn(),
    updateDoctor: jest.fn(),
    replaceDoctorSchedules: jest.fn(),
    listEducationFieldOfStudyCodes: jest.fn().mockResolvedValue([]),
  } as unknown as DoctorManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const auditServiceMock = {
    record: jest.fn(),
  } as unknown as AuditService;

  // The credential catalog is exercised on its own; here it stands in as an
  // always-permissive catalog whose labels are the codes, so these tests keep
  // asserting the doctor rules rather than the resolver's.
  const doctorCredentialOptionServiceMock = {
    assertUsableCodes: jest.fn().mockResolvedValue(undefined),
    buildResolver: jest
      .fn()
      .mockResolvedValue((_kind: string, stored: string) => ({ label: stored, isLegacy: true })),
  } as unknown as DoctorCredentialOptionService;

  // Every create names an account since P20-T01, so these default to the
  // commonest outcome — a new address, invited — and tests that care about
  // attach or refusal override them.
  const userInvitationServiceMock = {
    resolveDoctorOwnerPlan: jest
      .fn()
      .mockImplementation(async (email: string) => ({ kind: 'INVITE', email })),
    inviteDoctorOwner: jest
      .fn()
      // Far in the future: the service reads a past expiry as a lapsed link.
      .mockImplementation(async ({ email }: { email: string }) => ({
        email,
        expiresAt: '2099-01-01T00:00:00.000Z',
      })),
  } as unknown as UserInvitationService;

  const adminManagementServiceMock = {
    grantRoleCodes: jest.fn(),
  } as unknown as AdminManagementService;

  const service = new DoctorManagementService(
    doctorManagementRepositoryMock,
    authRepositoryMock,
    auditServiceMock,
    doctorCredentialOptionServiceMock,
    userInvitationServiceMock,
    adminManagementServiceMock,
  );

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';

  const specialtyId = '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111';
  const neurologySpecialtyId = '1a2dcc2a-9b5b-4cc1-8b6f-3ea508b4d222';

  const doctorRecord = {
    id: doctorId,
    licenseNumber: 'LIC-0001',
    fullName: 'Dr. First',
    specialtyId,
    specialty: { id: specialtyId, name: 'Cardiology' },
    phoneNumber: '0812345678',
    ownerUser: null,
    title: null,
    degrees: null,
    nikLast4: null,
    satusehatPractitionerId: null,
    ownerUserId: null,
    isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  // Synthetic 16-digit NIK — digits 7-12 encode 15/03/80 for a male doctor.
  const inputDoctorNik = '3173011503800002';
  const inputDoctorEmail = 'dr.first@clinic.local';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists doctors with active patient counts', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.listDoctors as jest.Mock).mockResolvedValue({
      items: [
        {
          ...doctorRecord,
          _count: {
            patients: 3,
          },
          schedules: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              dayOfWeek: 1,
              startTime: '08:00',
              endTime: '16:00',
              isAvailable: true,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listDoctors({ page: 1, limit: 10 }, currentUser);

    expect(result.items[0]?.patientCount).toBe(3);
    expect(result.items[0]?.schedules).toEqual([
      {
        id: '99999999-9999-4999-8999-999999999999',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '16:00',
        isAvailable: true,
      },
    ]);
    expect(result.items[0]?.createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(result.meta.total).toBe(1);
  });

  it('denies listing doctors without doctor.read:any', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'ANY' }]),
    );

    await expect(service.listDoctors({ page: 1, limit: 10 }, currentUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws conflict when license number already exists', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue({
      id: 'existing-doctor',
    });

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0001',
          fullName: 'Dr. First',
          specialtyId,
          phoneNumber: '0812345678',
          email: inputDoctorEmail,
          nik: inputDoctorNik,
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws conflict when the email already belongs to a doctor, before creating anything', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );
    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: neurologySpecialtyId,
    });
    (userInvitationServiceMock.resolveDoctorOwnerPlan as jest.Mock).mockResolvedValueOnce({
      kind: 'ATTACH',
      userId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      email: 'dr.second@clinic.local',
    });
    (doctorManagementRepositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
      id: 'existing-doctor',
    });

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0002',
          fullName: 'Dr. Second',
          specialtyId: neurologySpecialtyId,
          phoneNumber: '0812345679',
          email: 'dr.second@clinic.local',
          nik: inputDoctorNik,
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(doctorManagementRepositoryMock.createDoctor).not.toHaveBeenCalled();
  });

  it('attaches an existing free account by its email instead of inviting it', async () => {
    const existingUserId = '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704';
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );
    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: specialtyId,
    });
    (userInvitationServiceMock.resolveDoctorOwnerPlan as jest.Mock).mockResolvedValueOnce({
      kind: 'ATTACH',
      userId: existingUserId,
      email: inputDoctorEmail,
    });
    (doctorManagementRepositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: existingUserId,
    });

    const result = await service.createDoctor(
      {
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialtyId,
        phoneNumber: '0812345678',
        email: inputDoctorEmail,
        nik: inputDoctorNik,
        isActive: true,
      },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.createDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: existingUserId }),
    );
    expect(adminManagementServiceMock.grantRoleCodes).toHaveBeenCalledWith({
      userId: existingUserId,
      roleCodes: ['DOCTOR'],
      assignedById: currentUser.sub,
    });
    expect(userInvitationServiceMock.inviteDoctorOwner).not.toHaveBeenCalled();
    expect(result.invitationStatus).toBe('ACCEPTED');
  });

  it('invites a new address and reports the doctor as pending', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );
    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: specialtyId,
    });
    (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue(doctorRecord);

    const result = await service.createDoctor(
      {
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialtyId,
        phoneNumber: '0812345678',
        email: inputDoctorEmail,
        nik: inputDoctorNik,
        isActive: true,
      },
      currentUser,
    );

    expect(userInvitationServiceMock.inviteDoctorOwner).toHaveBeenCalledWith({
      email: inputDoctorEmail,
      doctorProfileId: doctorId,
      invitedById: currentUser.sub,
    });
    expect(result.email).toBe(inputDoctorEmail);
    expect(result.invitationStatus).toBe('PENDING');
  });

  it('throws bad request when an initial patient is missing or inactive', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: neurologySpecialtyId,
    });
    (doctorManagementRepositoryMock.findActivePatientsByIds as jest.Mock).mockResolvedValue([
      { id: '3a6d785d-f729-4af2-b415-30f96439dad0' },
    ]);

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0002',
          fullName: 'Dr. Second',
          specialtyId: neurologySpecialtyId,
          phoneNumber: '0812345679',
          email: 'dr.second@clinic.local',
          nik: inputDoctorNik,
          isActive: true,
          patientIds: [
            '3a6d785d-f729-4af2-b415-30f96439dad0',
            '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(doctorManagementRepositoryMock.createDoctor).not.toHaveBeenCalled();
  });

  it('creates a doctor with initial patient assignments atomically', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(null);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: specialtyId,
    });
    (doctorManagementRepositoryMock.findActivePatientsByIds as jest.Mock).mockResolvedValue([
      { id: '3a6d785d-f729-4af2-b415-30f96439dad0' },
      { id: '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8' },
    ]);
    (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue(doctorRecord);

    const result = await service.createDoctor(
      {
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialtyId,
        phoneNumber: '0812345678',
        email: inputDoctorEmail,
        nik: inputDoctorNik,
        isActive: true,
        patientIds: [
          '3a6d785d-f729-4af2-b415-30f96439dad0',
          '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
        ],
      },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.createDoctor).toHaveBeenCalledWith(
      expect.objectContaining({
        patientIds: [
          '3a6d785d-f729-4af2-b415-30f96439dad0',
          '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
        ],
        actorUserId: currentUser.sub,
      }),
    );
    expect(result.licenseNumber).toBe('LIC-0001');
  });

  describe('licensing and identity fields', () => {
    it('throws conflict when the NIK already belongs to another doctor', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
        null,
      );
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue({
        id: 'existing-doctor',
      });

      await expect(
        service.createDoctor(
          {
            licenseNumber: 'LIC-0002',
            fullName: 'Dr. Second',
            specialtyId,
            phoneNumber: '0812345679',
            email: 'dr.second@clinic.local',
            nik: inputDoctorNik,
            isActive: true,
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(doctorManagementRepositoryMock.createDoctor).not.toHaveBeenCalled();
    });

    it('creates a doctor with NIK and licenses converted to write payloads', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
        null,
      );
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue(null);
      (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
        id: specialtyId,
      });
      (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        nikLast4: '0002',
        satusehatPractitionerId: '10009880728',
      });

      const result = await service.createDoctor(
        {
          licenseNumber: 'LIC-0001',
          fullName: 'Dr. First',
          specialtyId,
          phoneNumber: '0812345678',
          email: inputDoctorEmail,
          nik: inputDoctorNik,
          satusehatPractitionerId: '10009880728',
          licenses: [
            { type: 'STR', licenseNumber: 'STR-31-2019-000101', issuedAt: '2019-03-01' },
            {
              type: 'SIP',
              licenseNumber: 'LIC-0001',
              issuedAt: '2026-01-02',
              expiresAt: '2031-01-01',
            },
          ],
          isActive: true,
        },
        currentUser,
      );

      expect(doctorManagementRepositoryMock.createDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          nik: inputDoctorNik,
          satusehatPractitionerId: '10009880728',
          licenses: [
            {
              type: 'STR',
              licenseNumber: 'STR-31-2019-000101',
              issuedAt: new Date('2019-03-01T00:00:00.000Z'),
              expiresAt: null,
            },
            {
              type: 'SIP',
              licenseNumber: 'LIC-0001',
              issuedAt: new Date('2026-01-02T00:00:00.000Z'),
              expiresAt: new Date('2031-01-01T00:00:00.000Z'),
            },
          ],
        }),
      );
      expect(result.nikMasked).toBe('••••••••0002');
      expect(result.satusehatPractitionerId).toBe('10009880728');
    });

    it('allows a doctor to keep its own NIK on update', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue({
        id: doctorId,
      });
      (doctorManagementRepositoryMock.updateDoctor as jest.Mock).mockResolvedValue({
        doctor: { ...doctorRecord, nikLast4: '0002' },
        clearedSatusehatLink: false,
      });

      const result = await service.updateDoctor(doctorId, { nik: inputDoctorNik }, currentUser);

      expect(result.nikMasked).toBe('••••••••0002');
    });

    it('never returns the plaintext NIK on any response', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
        null,
      );
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue(null);
      (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
        id: specialtyId,
      });
      (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        nikLast4: '0002',
      });

      const result = await service.createDoctor(
        {
          licenseNumber: 'LIC-0001',
          fullName: 'Dr. First',
          specialtyId,
          phoneNumber: '0812345678',
          email: inputDoctorEmail,
          nik: inputDoctorNik,
          isActive: true,
        },
        currentUser,
      );

      expect(JSON.stringify(result)).not.toContain(inputDoctorNik);
      expect(result).not.toHaveProperty('nik');
    });

    it('translates a concurrent NIK uniqueness race into the same conflict', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
        null,
      );
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue(null);
      (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
        id: specialtyId,
      });
      (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockRejectedValue(
        new DoctorIdentifierConflictError('nik'),
      );

      await expect(
        service.createDoctor(
          {
            licenseNumber: 'LIC-0001',
            fullName: 'Dr. First',
            specialtyId,
            phoneNumber: '0812345678',
            email: inputDoctorEmail,
            nik: inputDoctorNik,
            isActive: true,
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes the plaintext NIK to the repository so it can encrypt it', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorManagementRepositoryMock.findDoctorByNik as jest.Mock).mockResolvedValue(null);
      (doctorManagementRepositoryMock.updateDoctor as jest.Mock).mockResolvedValue({
        doctor: { ...doctorRecord, nikLast4: '0002' },
        clearedSatusehatLink: false,
      });

      await service.updateDoctor(doctorId, { nik: inputDoctorNik }, currentUser);

      expect(doctorManagementRepositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({ nik: inputDoctorNik }),
      );
    });

    it('refuses to clear the NIK, which would make the doctor unreportable', () => {
      const actual = updateDoctorSchema.safeParse({ nik: null });

      expect(actual.success).toBe(false);
    });

    it('replaces the license list on update', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorManagementRepositoryMock.updateDoctor as jest.Mock).mockResolvedValue({
        doctor: doctorRecord,
        clearedSatusehatLink: false,
      });

      await service.updateDoctor(
        doctorId,
        {
          licenses: [{ type: 'SIP', licenseNumber: 'SIP-2026-0009', expiresAt: '2031-01-01' }],
        },
        currentUser,
      );

      expect(doctorManagementRepositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({
          licenses: [
            {
              type: 'SIP',
              licenseNumber: 'SIP-2026-0009',
              issuedAt: null,
              expiresAt: new Date('2031-01-01T00:00:00.000Z'),
            },
          ],
        }),
      );
    });

    it('returns active licenses with date-only strings in the doctor detail', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorDetailById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        _count: { patients: 0 },
        patients: [],
        schedules: [],
        educations: [],
        licenses: [
          {
            id: 'f0e1d2c3-b4a5-4657-8899-aabbccddeeff',
            type: 'STR',
            licenseNumber: 'STR-31-2019-000101',
            issuedAt: new Date('2019-03-01T00:00:00.000Z'),
            expiresAt: null,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        ],
      });

      const result = await service.getDoctorById(doctorId, currentUser);

      expect(result.licenses).toEqual([
        {
          id: 'f0e1d2c3-b4a5-4657-8899-aabbccddeeff',
          type: 'STR',
          licenseNumber: 'STR-31-2019-000101',
          issuedAt: '2019-03-01',
          expiresAt: undefined,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('profile listing fields', () => {
    it('creates a doctor with title, degrees, and educations', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
        null,
      );
      (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
        id: specialtyId,
      });
      (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        ownerUser: { email: 'dr.first@clinic.local' },
        title: 'DR',
        degrees: 'SP_JP,M_KES',
      });
      (doctorCredentialOptionServiceMock.buildResolver as jest.Mock).mockResolvedValueOnce(
        (_kind: string, stored: string) => ({
          code: stored,
          label: { DR: 'dr.', SP_JP: 'Sp.JP', M_KES: 'M.Kes' }[stored] ?? stored,
          isLegacy: false,
        }),
      );
      const inputEducations = [
        {
          institution: 'Universitas Indonesia',
          degree: 'dr.',
          fieldOfStudy: 'PENDIDIKAN_DOKTER',
          graduationYear: 2004,
        },
      ];
      const result = await service.createDoctor(
        {
          licenseNumber: 'LIC-0001',
          fullName: 'Dr. First',
          specialtyId,
          phoneNumber: '0812345678',
          email: inputDoctorEmail,
          nik: inputDoctorNik,
          title: 'DR',
          degrees: ['SP_JP', 'M_KES'],
          educations: inputEducations,
          isActive: true,
        },
        currentUser,
      );
      // The ordered code list is stored comma-joined in the single column.
      expect(doctorManagementRepositoryMock.createDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'DR',
          degrees: 'SP_JP,M_KES',
          educations: inputEducations,
        }),
      );
      // Read back from the linked account, the only place it is stored.
      expect(result.email).toBe('dr.first@clinic.local');
      expect(result.title).toBe('dr.');
      expect(result.degrees).toBe('Sp.JP, M.Kes');
    });

    it('replaces the education list on update', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorManagementRepositoryMock.updateDoctor as jest.Mock).mockResolvedValue({
        doctor: doctorRecord,
        clearedSatusehatLink: false,
      });
      const inputEducations = [
        {
          institution: 'Universitas Gadjah Mada',
          degree: 'Sp.A',
          fieldOfStudy: 'ILMU_KESEHATAN_ANAK',
          graduationYear: 2014,
        },
      ];
      await service.updateDoctor(doctorId, { educations: inputEducations }, currentUser);
      expect(doctorManagementRepositoryMock.updateDoctor).toHaveBeenCalledWith(
        doctorId,
        expect.objectContaining({ educations: inputEducations }),
      );
    });

    it('returns active educations in the doctor detail', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorDetailById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        title: 'dr.',
        degrees: 'Sp.PD',
        ownerUser: { email: 'dr.first@clinic.local' },
        _count: { patients: 0 },
        patients: [],
        schedules: [],
        licenses: [],
        educations: [
          {
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            institution: 'Universitas Indonesia',
            degree: 'Sp.PD',
            fieldOfStudy: 'Penyakit Dalam',
            graduationYear: 2010,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        ],
      });
      const result = await service.getDoctorById(doctorId, currentUser);
      // Free text written before the credential catalog existed (P19-T14):
      // it still prints exactly as stored, and is flagged so the form asks an
      // admin to pick a replacement rather than dropping the credential.
      expect(result.title).toBe('dr.');
      expect(result.titleValue).toEqual({ label: 'dr.', isLegacy: true });
      expect(result.degrees).toBe('Sp.PD');
      expect(result.email).toBe('dr.first@clinic.local');
      expect(result.educations).toEqual([
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          institution: 'Universitas Indonesia',
          degree: 'Sp.PD',
          fieldOfStudy: 'Penyakit Dalam',
          fieldOfStudyValue: { label: 'Penyakit Dalam', isLegacy: true },
          graduationYear: 2010,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ]);
    });

    it('rejects a credential code that names no live option', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorCredentialOptionServiceMock.assertUsableCodes as jest.Mock).mockRejectedValueOnce(
        new BadRequestException({
          message: 'Unknown or inactive DEGREE credential option',
          details: { field: 'degrees', unknownCodes: ['SP_MADE_UP'] },
        }),
      );
      await expect(
        service.updateDoctor(doctorId, { degrees: ['SP_MADE_UP'] }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(doctorManagementRepositoryMock.updateDoctor).not.toHaveBeenCalled();
    });
  });

  it('rejects overlapping schedule entries on the same day', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [
            { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
            { dayOfWeek: 1, startTime: '11:00', endTime: '14:00', isAvailable: true },
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(doctorManagementRepositoryMock.replaceDoctorSchedules).not.toHaveBeenCalled();
  });

  it('allows overlapping times on the same day when one entry is unavailable', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
    (doctorManagementRepositoryMock.replaceDoctorSchedules as jest.Mock).mockResolvedValue([
      {
        id: 'b7c9a316-40b2-4f4c-9207-2a58028babc4',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '12:00',
        isAvailable: true,
      },
    ]);

    const result = await service.updateDoctorSchedule(
      doctorId,
      {
        schedules: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', isAvailable: false },
        ],
      },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.replaceDoctorSchedules).toHaveBeenCalled();
    expect(result[0]?.startTime).toBe('08:00');
  });

  it('denies own-scope schedule writes for another doctor profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: 'someone-else',
    });

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows own-scope schedule writes for the own doctor profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: currentUser.sub,
    });
    (doctorManagementRepositoryMock.replaceDoctorSchedules as jest.Mock).mockResolvedValue([]);

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00', isAvailable: true }],
        },
        currentUser,
      ),
    ).resolves.toEqual([]);
  });

  it('includes related patients in detail only for permitted callers', async () => {
    const detailRecord = {
      ...doctorRecord,
      ownerUserId: currentUser.sub,
      licenses: [],
      educations: [],
      _count: {
        patients: 1,
      },
      patients: [
        {
          id: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
          patient: {
            id: '3a6d785d-f729-4af2-b415-30f96439dad0',
            mrn: 'MRN-0001',
            fullName: 'John Patient',
          },
        },
      ],
      schedules: [],
    };

    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([
        { action: 'read', resource: 'Doctor', scope: 'ANY' },
        { action: 'read', resource: 'Patient', scope: 'OWN' },
      ]),
    );
    (doctorManagementRepositoryMock.findDoctorDetailById as jest.Mock).mockResolvedValue(
      detailRecord,
    );

    const ownResult = await service.getDoctorById(doctorId, currentUser);

    expect(ownResult.patients).toEqual([
      {
        id: '3a6d785d-f729-4af2-b415-30f96439dad0',
        assignmentId: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
        mrn: 'MRN-0001',
        fullName: 'John Patient',
      },
    ]);
    expect(ownResult.patientCount).toBe(1);

    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
    );

    const restrictedResult = await service.getDoctorById(doctorId, currentUser);

    expect(restrictedResult.patients).toBeUndefined();
    expect(restrictedResult.patientCount).toBe(1);
  });

  it('updates a doctor profile with update:any permission', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
    );
    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
    (doctorManagementRepositoryMock.findActiveSpecialtyById as jest.Mock).mockResolvedValue({
      id: neurologySpecialtyId,
    });
    (doctorManagementRepositoryMock.updateDoctor as jest.Mock).mockResolvedValue({
      doctor: {
        ...doctorRecord,
        specialtyId: neurologySpecialtyId,
        specialty: { id: neurologySpecialtyId, name: 'Neurology' },
      },
      clearedSatusehatLink: false,
    });

    const result = await service.updateDoctor(
      doctorId,
      { specialtyId: neurologySpecialtyId },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.updateDoctor).toHaveBeenCalledWith(
      doctorId,
      expect.objectContaining({ specialtyId: neurologySpecialtyId }),
    );
    expect(result.specialty).toBe('Neurology');
  });

  it('refuses an own-scope caller on the administrative route, even for their own profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'update', resource: 'Doctor', scope: 'OWN' }]),
    );
    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: currentUser.sub,
    });

    await expect(
      service.updateDoctor(doctorId, { specialtyId: neurologySpecialtyId }, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(doctorManagementRepositoryMock.updateDoctor).not.toHaveBeenCalled();
  });

  it('throws conflict when reassigning owner already linked to another doctor', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
    );
    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
    (doctorManagementRepositoryMock.findActiveUserById as jest.Mock).mockResolvedValue({
      id: 'ec7602c6-e489-4d0f-a8a7-b0f91a5bfbe2',
    });
    (doctorManagementRepositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
      id: 'another-doctor-id',
    });

    await expect(
      service.updateDoctor(
        doctorId,
        { ownerUserId: 'ec7602c6-e489-4d0f-a8a7-b0f91a5bfbe2' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(doctorManagementRepositoryMock.updateDoctor).not.toHaveBeenCalled();
  });
  describe('inviting a doctor who has no account (P20-T01)', () => {
    const existingUserId = 'ec7602c6-e489-4d0f-a8a7-b0f91a5bfbe2';
    const inputInvitee = { email: 'dr.legacy@clinic.local' };

    function mockAdministrator(): void {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'ANY' }]),
      );
    }

    it('refuses a caller who can only update their own profile', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'update', resource: 'Doctor', scope: 'OWN' }]),
      );

      await expect(
        service.inviteDoctorAccount(doctorId, inputInvitee, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userInvitationServiceMock.inviteDoctorOwner).not.toHaveBeenCalled();
    });

    it('refuses a doctor who already has an account', async () => {
      mockAdministrator();
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        ownerUserId: existingUserId,
      });

      await expect(
        service.inviteDoctorAccount(doctorId, inputInvitee, currentUser),
      ).rejects.toMatchObject({ response: { code: 'DOCTOR_ACCOUNT_ALREADY_LINKED' } });
      expect(userInvitationServiceMock.resolveDoctorOwnerPlan).not.toHaveBeenCalled();
    });

    it('refuses a doctor whose invitation is still live, which is resent elsewhere', async () => {
      mockAdministrator();
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        ownerInvitations: [
          { email: 'dr.legacy@clinic.local', expiresAt: new Date(Date.now() + 86_400_000) },
        ],
      });

      await expect(
        service.inviteDoctorAccount(doctorId, inputInvitee, currentUser),
      ).rejects.toMatchObject({ response: { code: 'DOCTOR_INVITATION_ALREADY_PENDING' } });
      expect(userInvitationServiceMock.inviteDoctorOwner).not.toHaveBeenCalled();
    });

    it('invites a new address bound to the existing profile', async () => {
      mockAdministrator();
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock)
        .mockResolvedValueOnce(doctorRecord)
        .mockResolvedValueOnce({
          ...doctorRecord,
          ownerInvitations: [
            { email: 'dr.legacy@clinic.local', expiresAt: new Date(Date.now() + 86_400_000) },
          ],
        });

      const result = await service.inviteDoctorAccount(doctorId, inputInvitee, currentUser);

      expect(userInvitationServiceMock.inviteDoctorOwner).toHaveBeenCalledWith({
        email: 'dr.legacy@clinic.local',
        doctorProfileId: doctorId,
        invitedById: currentUser.sub,
      });
      expect(doctorManagementRepositoryMock.updateDoctor).not.toHaveBeenCalled();
      expect(result.invitationStatus).toBe('PENDING');
      expect(result.email).toBe('dr.legacy@clinic.local');
    });

    it('treats a lapsed invitation as no account and invites again', async () => {
      mockAdministrator();
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        ownerInvitations: [
          { email: 'dr.legacy@clinic.local', expiresAt: new Date('2026-01-01T00:00:00.000Z') },
        ],
      });

      await service.inviteDoctorAccount(doctorId, inputInvitee, currentUser);

      expect(userInvitationServiceMock.inviteDoctorOwner).toHaveBeenCalledTimes(1);
    });

    it('attaches an address that already has an account, granting DOCTOR', async () => {
      mockAdministrator();
      (userInvitationServiceMock.resolveDoctorOwnerPlan as jest.Mock).mockResolvedValueOnce({
        kind: 'ATTACH',
        userId: existingUserId,
        email: 'dr.legacy@clinic.local',
      });
      (doctorManagementRepositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock)
        .mockResolvedValueOnce(doctorRecord)
        .mockResolvedValueOnce({
          ...doctorRecord,
          ownerUserId: existingUserId,
          ownerUser: { email: 'dr.legacy@clinic.local' },
        });

      const result = await service.inviteDoctorAccount(doctorId, inputInvitee, currentUser);

      expect(doctorManagementRepositoryMock.updateDoctor).toHaveBeenCalledWith(doctorId, {
        ownerUserId: existingUserId,
      });
      expect(adminManagementServiceMock.grantRoleCodes).toHaveBeenCalledWith({
        userId: existingUserId,
        roleCodes: ['DOCTOR'],
        assignedById: currentUser.sub,
      });
      expect(userInvitationServiceMock.inviteDoctorOwner).not.toHaveBeenCalled();
      expect(result.invitationStatus).toBe('ACCEPTED');
      expect(result.ownerUserId).toBe(existingUserId);
    });
  });

  describe('identifier unmasking', () => {
    beforeEach(() => {
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
      (doctorManagementRepositoryMock.findDoctorIdentifiers as jest.Mock).mockResolvedValue({
        nik: inputDoctorNik,
      });
    });

    it('refuses a caller holding only doctor.read', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
      );

      await expect(service.getDoctorIdentifiers(doctorId, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(doctorManagementRepositoryMock.findDoctorIdentifiers).not.toHaveBeenCalled();
    });

    it('returns the decrypted practitioner NIK and audits the disclosure', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read-identifier', resource: 'Doctor', scope: 'ANY' }]),
      );

      const actual = await service.getDoctorIdentifiers(doctorId, currentUser);

      expect(actual).toEqual({ id: doctorId, nik: inputDoctorNik });
      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'DOCTOR_IDENTIFIER_UNMASKED',
        resource: 'DoctorProfile',
        resourceId: doctorId,
        actorUserId: currentUser.sub,
        metadata: { scope: 'ANY', fields: ['nik'] },
      });
      expect(JSON.stringify((auditServiceMock.record as jest.Mock).mock.calls)).not.toContain(
        inputDoctorNik,
      );
    });

    it('denies an own-scope caller who does not own the profile', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read-identifier', resource: 'Doctor', scope: 'OWN' }]),
      );

      await expect(service.getDoctorIdentifiers(doctorId, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets a doctor read back their own NIK', async () => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([{ action: 'read-identifier', resource: 'Doctor', scope: 'OWN' }]),
      );
      (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
        ...doctorRecord,
        ownerUserId: currentUser.sub,
      });

      const actual = await service.getDoctorIdentifiers(doctorId, currentUser);

      expect(actual.nik).toBe(inputDoctorNik);
    });
  });
});
