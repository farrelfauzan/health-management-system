import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { PatientIdentifierConflictError } from '../repository/patient-identifier-conflict.error';
import { PatientManagementRepository } from '../repository/patient-management.repository';
import { PatientManagementService } from './patient-management.service';

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

describe('PatientManagementService', () => {
  const patientManagementRepositoryMock = {
    listPatients: jest.fn(),
    findPatientById: jest.fn(),
    findPatientDetailById: jest.fn(),
    findPatientByMrn: jest.fn(),
    findPatientIdByNik: jest.fn(),
    findPatientIdByBpjsNumber: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveDoctorsByIds: jest.fn(),
    hasActiveAssignmentWithDoctorUser: jest.fn(),
    createPatient: jest.fn(),
    updatePatient: jest.fn(),
  } as unknown as PatientManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new PatientManagementService(patientManagementRepositoryMock, authRepositoryMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'patient@hms.local',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (patientManagementRepositoryMock.findPatientIdByNik as jest.Mock).mockResolvedValue(null);
    (patientManagementRepositoryMock.findPatientIdByBpjsNumber as jest.Mock).mockResolvedValue(null);
  });

  it('lists patients with any-scope permission', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.listPatients as jest.Mock).mockResolvedValue({
      items: [
        {
          id: '3a6d785d-f729-4af2-b415-30f96439dad0',
          mrn: 'MRN-0001',
          fullName: 'John Patient',
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          sex: 'MALE',
          status: 'IN_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          ownerUserId: currentUser.sub,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          _count: {
            doctors: 2,
            allergies: 1,
          },
          doctors: [
            {
              id: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
              doctor: {
                id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
                fullName: 'Dr. Assigned',
                specialty: { name: 'Cardiology' },
              },
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listPatients(
      { page: 1, limit: 10, status: 'IN_PATIENT', createdFrom: '2026-01-01' },
      currentUser,
    );

    expect(patientManagementRepositoryMock.listPatients).toHaveBeenCalledWith(
      {
        page: 1,
        limit: 10,
        status: 'IN_PATIENT',
        createdFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      currentUser,
      true,
    );
    expect(result.meta.total).toBe(1);
    expect(result.items[0]?.dateOfBirth).toBe('1990-01-01');
    expect(result.items[0]?.sex).toBe('MALE');
    expect(result.items[0]?.status).toBe('IN_PATIENT');
    expect(result.items[0]?.doctorCount).toBe(2);
    expect(result.items[0]?.doctors).toEqual([
      {
        id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
        assignmentId: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
        fullName: 'Dr. Assigned',
        specialty: 'Cardiology',
      },
    ]);
  });

  it('denies reading patient detail when only own scope and no ownership or active assignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientDetailById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      doctors: [],
    });
    (
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser as jest.Mock
    ).mockResolvedValue(false);

    await expect(
      service.getPatientById('3a6d785d-f729-4af2-b415-30f96439dad0', currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows own-scope doctor to read patient detail through an active assignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientDetailById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      doctors: [
        {
          id: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
          doctor: {
            id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
            fullName: 'Dr. Assigned',
            specialty: { name: 'Cardiology' },
          },
        },
      ],
      allergies: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          substance: 'Penicillin',
          reaction: 'Urticaria',
          severity: 'SEVERE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    });
    (
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser as jest.Mock
    ).mockResolvedValue(true);

    const result = await service.getPatientById(
      '3a6d785d-f729-4af2-b415-30f96439dad0',
      currentUser,
    );

    expect(
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser,
    ).toHaveBeenCalledWith('3a6d785d-f729-4af2-b415-30f96439dad0', currentUser.sub);
    expect(result.doctors).toEqual([
      {
        id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
        assignmentId: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
        fullName: 'Dr. Assigned',
        specialty: 'Cardiology',
      },
    ]);
  });

  it('throws conflict when MRN already exists', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue({
      id: 'existing-id',
    });

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0001',
          fullName: 'John Patient',
          dateOfBirth: '1990-01-01',
          sex: 'MALE',
          status: 'OUT_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies own-scope update when attempting owner reassignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'update', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: currentUser.sub,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(
      service.updatePatient(
        '3a6d785d-f729-4af2-b415-30f96439dad0',
        {
          ownerUserId: 'ec7602c6-e489-4d0f-a8a7-b0f91a5bfbe2',
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws bad request when an initial doctor is missing or inactive', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
    (patientManagementRepositoryMock.findActiveDoctorsByIds as jest.Mock).mockResolvedValue([
      { id: '58e9a316-40b2-4f4c-9207-2a58028babc4' },
    ]);

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0003',
          fullName: 'Jane Patient',
          dateOfBirth: '1990-01-01',
          sex: 'FEMALE',
          status: 'OUT_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
          doctorIds: [
            '58e9a316-40b2-4f4c-9207-2a58028babc4',
            '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patientManagementRepositoryMock.createPatient).not.toHaveBeenCalled();
  });

  it('creates a patient with initial doctor assignments atomically', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
    (patientManagementRepositoryMock.findActiveDoctorsByIds as jest.Mock).mockResolvedValue([
      { id: '58e9a316-40b2-4f4c-9207-2a58028babc4' },
      { id: '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8' },
    ]);
    (patientManagementRepositoryMock.createPatient as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0003',
      fullName: 'Jane Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await service.createPatient(
      {
        mrn: 'MRN-0003',
        fullName: 'Jane Patient',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
        status: 'OUT_PATIENT',
        phoneNumber: '12345',
        address: 'Main Street',
        isActive: true,
        doctorIds: ['58e9a316-40b2-4f4c-9207-2a58028babc4', '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8'],
      },
      currentUser,
    );

    expect(patientManagementRepositoryMock.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorIds: [
          '58e9a316-40b2-4f4c-9207-2a58028babc4',
          '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
        ],
        actorUserId: currentUser.sub,
      }),
    );
    expect(result.patient.mrn).toBe('MRN-0003');
  });

  it('throws bad request when date value is invalid', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0002',
          fullName: 'Jane Patient',
          dateOfBirth: '1990-13-01',
          sex: 'FEMALE',
          status: 'OUT_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('national and payer identifiers', () => {
    const inputCreatePayload = {
      mrn: 'MRN-0100',
      fullName: 'Aisha Rahman',
      dateOfBirth: '1990-05-12',
      sex: 'FEMALE' as const,
      status: 'OUT_PATIENT' as const,
      phoneNumber: '12345',
      address: 'Main Street',
      isActive: true,
      nik: '3201015205900001',
    };

    const mockCreatedPatient = {
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0100',
      fullName: 'Aisha Rahman',
      dateOfBirth: new Date('1990-05-12T00:00:00.000Z'),
      placeOfBirth: null,
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      nikLast4: '0001',
      bpjsNumberLast4: null,
      hasSatusehatPatientId: false,
      ownerUserId: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([
          { action: 'create', resource: 'Patient', scope: 'ANY' },
          { action: 'update', resource: 'Patient', scope: 'ANY' },
        ]),
      );
      (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
      (patientManagementRepositoryMock.createPatient as jest.Mock).mockResolvedValue(
        mockCreatedPatient,
      );
      (patientManagementRepositoryMock.updatePatient as jest.Mock).mockResolvedValue(
        mockCreatedPatient,
      );
      (patientManagementRepositoryMock.findPatientById as jest.Mock).mockResolvedValue(
        mockCreatedPatient,
      );
    });

    it('returns the identifier masked, never in plaintext', async () => {
      const actual = await service.createPatient(inputCreatePayload, currentUser);

      expect(actual.patient.nikMasked).toBe('••••••••0001');
      expect(JSON.stringify(actual.patient)).not.toContain('3201015205900001');
    });

    it('reports no SATUSEHAT linkage until one is resolved', async () => {
      const actual = await service.createPatient(inputCreatePayload, currentUser);

      expect(actual.patient.hasSatusehatPatientId).toBe(false);
    });

    it('rejects a NIK already registered to another patient', async () => {
      (patientManagementRepositoryMock.findPatientIdByNik as jest.Mock).mockResolvedValue({
        id: 'ca8c0a6e-1d2e-4f70-9d1a-1a7b0f4a0f11',
      });

      await expect(service.createPatient(inputCreatePayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(patientManagementRepositoryMock.createPatient).not.toHaveBeenCalled();
    });

    it('rejects a BPJS number already registered to another patient', async () => {
      (patientManagementRepositoryMock.findPatientIdByBpjsNumber as jest.Mock).mockResolvedValue({
        id: 'ca8c0a6e-1d2e-4f70-9d1a-1a7b0f4a0f11',
      });

      await expect(
        service.createPatient(
          { ...inputCreatePayload, bpjsNumber: '0001234567890' },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('translates a concurrent uniqueness race into the same conflict', async () => {
      (patientManagementRepositoryMock.createPatient as jest.Mock).mockRejectedValue(
        new PatientIdentifierConflictError('nik'),
      );

      await expect(service.createPatient(inputCreatePayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a patient to keep its own identifier on update', async () => {
      (patientManagementRepositoryMock.findPatientIdByNik as jest.Mock).mockResolvedValue({
        id: mockCreatedPatient.id,
      });

      await expect(
        service.updatePatient(mockCreatedPatient.id, { nik: '3201015205900001' }, currentUser),
      ).resolves.toBeDefined();
    });

    it('returns no warning when the NIK agrees with birth date and sex', async () => {
      const actual = await service.createPatient(inputCreatePayload, currentUser);

      expect(actual.identifierWarnings).toEqual([]);
    });

    it('warns without rejecting when the NIK encodes a different sex', async () => {
      const actual = await service.createPatient(
        { ...inputCreatePayload, nik: '3201011205900001' },
        currentUser,
      );

      expect(actual.identifierWarnings).toEqual([
        'NIK encodes MALE but FEMALE was submitted',
      ]);
      expect(patientManagementRepositoryMock.createPatient).toHaveBeenCalled();
    });

    it('warns without rejecting when the NIK encodes a different birth date', async () => {
      const actual = await service.createPatient(
        { ...inputCreatePayload, nik: '3201015206900001' },
        currentUser,
      );

      expect(actual.identifierWarnings).toEqual([
        'NIK encodes a different birth date than the one submitted',
      ]);
    });

    it('returns no warnings when no NIK was submitted', async () => {
      const actual = await service.createPatient(
        { ...inputCreatePayload, nik: undefined },
        currentUser,
      );

      expect(actual.identifierWarnings).toEqual([]);
    });

    it('passes the identifier through to the repository for encryption', async () => {
      await service.createPatient(inputCreatePayload, currentUser);

      expect(patientManagementRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({ nik: '3201015205900001' }),
      );
    });
  });

  describe('demographic and clinical-safety fields', () => {
    const mockPatientRecord = {
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0200',
      fullName: 'Aisha Rahman',
      dateOfBirth: new Date('1990-05-12T00:00:00.000Z'),
      placeOfBirth: 'Bandung',
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      nikLast4: null,
      bpjsNumberLast4: null,
      hasSatusehatPatientId: false,
      email: 'aisha.rahman@example.com',
      bloodType: 'O',
      rhesusFactor: 'POSITIVE',
      maritalStatus: 'MARRIED',
      occupation: 'Teacher',
      religion: 'ISLAM',
      emergencyContactName: 'Rahmat Rahman',
      emergencyContactPhone: '+628123456700',
      guardianName: 'Rahmat Rahman',
      guardianRelation: 'Spouse',
      ownerUserId: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const inputCreatePayload = {
      mrn: 'MRN-0200',
      fullName: 'Aisha Rahman',
      dateOfBirth: '1990-05-12',
      sex: 'FEMALE' as const,
      status: 'OUT_PATIENT' as const,
      phoneNumber: '12345',
      address: 'Main Street',
      isActive: true,
      bloodType: 'O' as const,
      rhesusFactor: 'POSITIVE' as const,
      religion: 'ISLAM' as const,
      allergies: [{ substance: 'Penicillin', severity: 'SEVERE' as const }],
    };

    beforeEach(() => {
      (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
        buildActor([
          { action: 'create', resource: 'Patient', scope: 'ANY' },
          { action: 'update', resource: 'Patient', scope: 'ANY' },
          { action: 'read', resource: 'Patient', scope: 'ANY' },
        ]),
      );
      (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
      (patientManagementRepositoryMock.createPatient as jest.Mock).mockResolvedValue(
        mockPatientRecord,
      );
      (patientManagementRepositoryMock.updatePatient as jest.Mock).mockResolvedValue(
        mockPatientRecord,
      );
      (patientManagementRepositoryMock.findPatientById as jest.Mock).mockResolvedValue(
        mockPatientRecord,
      );
    });

    it('returns the demographic fields on the response', async () => {
      const actual = await service.createPatient(inputCreatePayload, currentUser);

      expect(actual.patient).toEqual(
        expect.objectContaining({
          placeOfBirth: 'Bandung',
          bloodType: 'O',
          rhesusFactor: 'POSITIVE',
          maritalStatus: 'MARRIED',
          occupation: 'Teacher',
          religion: 'ISLAM',
          email: 'aisha.rahman@example.com',
          emergencyContactName: 'Rahmat Rahman',
          emergencyContactPhone: '+628123456700',
          guardianName: 'Rahmat Rahman',
          guardianRelation: 'Spouse',
        }),
      );
    });

    it('passes the allergy list through to the repository', async () => {
      await service.createPatient(inputCreatePayload, currentUser);

      expect(patientManagementRepositoryMock.createPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          allergies: [{ substance: 'Penicillin', severity: 'SEVERE' }],
        }),
      );
    });

    it('forwards an empty allergy list so the existing list is cleared', async () => {
      await service.updatePatient(mockPatientRecord.id, { allergies: [] }, currentUser);

      expect(patientManagementRepositoryMock.updatePatient).toHaveBeenCalledWith(
        mockPatientRecord.id,
        expect.objectContaining({ allergies: [] }),
      );
    });

    it('leaves the allergy list untouched when the update omits it', async () => {
      await service.updatePatient(mockPatientRecord.id, { occupation: 'Nurse' }, currentUser);

      expect(patientManagementRepositoryMock.updatePatient).toHaveBeenCalledWith(
        mockPatientRecord.id,
        expect.objectContaining({ allergies: undefined, occupation: 'Nurse' }),
      );
    });

    it('clears a demographic field when the update sends null', async () => {
      await service.updatePatient(mockPatientRecord.id, { occupation: null }, currentUser);

      expect(patientManagementRepositoryMock.updatePatient).toHaveBeenCalledWith(
        mockPatientRecord.id,
        expect.objectContaining({ occupation: null }),
      );
    });

    it('exposes the allergy list on the detail response', async () => {
      (patientManagementRepositoryMock.findPatientDetailById as jest.Mock).mockResolvedValue({
        ...mockPatientRecord,
        doctors: [],
        allergies: [
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            substance: 'Penicillin',
            reaction: null,
            severity: 'SEVERE',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      });

      const actual = await service.getPatientById(mockPatientRecord.id, currentUser);

      expect(actual.allergies).toEqual([
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          substance: 'Penicillin',
          reaction: undefined,
          severity: 'SEVERE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });
});
