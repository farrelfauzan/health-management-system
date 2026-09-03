import { DoctorLicenseExpiryRow } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { DoctorLicenseExpiryService } from '../../doctor-management/service/doctor-license-expiry.service';
import { DoctorPatientService } from '../../doctor-patient/service/doctor-patient.service';
import { NotificationService } from '../../notification/service/notification.service';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';
import { AppointmentManagementService } from './appointment-management.service';

type SeededPermission = { action: string; resource: string; scope: 'ANY' | 'OWN' };

/**
 * The visibility rule of `P16-T20`, isolated (FR-E3-36).
 *
 * Worth its own file because the obvious implementation is wrong in a way
 * that is invisible from the diff. The natural gate for "scheduler-facing"
 * would be `hasAny` on `AppointmentSession` — but `seed.sql` grants
 * `appointment.session.read:any` to **PATIENT** as well as ADMIN, because a
 * patient has to see a doctor's sessions to book one. That gate would have
 * shipped "this practitioner is out of licence" into the patient portal.
 *
 * The permission lists below mirror the real seed for each role, so a future
 * grant change that reunites the two audiences fails here.
 */
const ADMIN_PERMISSIONS: SeededPermission[] = [
  { action: 'read', resource: 'AppointmentSession', scope: 'ANY' },
  { action: 'read', resource: 'DoctorLicenseExpiry', scope: 'ANY' },
];
const PATIENT_PERMISSIONS: SeededPermission[] = [
  // The real PATIENT grant — `:any`, not `:own`. This is the whole trap.
  { action: 'read', resource: 'AppointmentSession', scope: 'ANY' },
];
const DOCTOR_PERMISSIONS: SeededPermission[] = [
  { action: 'read', resource: 'AppointmentSession', scope: 'OWN' },
];

const DOCTOR_ID = '58e9a316-40b2-4f4c-9207-2a58028babc4';

function buildExpiredLicence(overrides: Partial<DoctorLicenseExpiryRow> = {}): DoctorLicenseExpiryRow {
  return {
    licenseId: 'license-1',
    doctorId: DOCTOR_ID,
    doctorName: 'dr. Rina Wijaya',
    type: 'SIP',
    licenseNumber: 'SIP-EXAMPLE-0001',
    issuedAt: '2021-03-12',
    expiresAt: '2026-08-20',
    daysUntilExpiry: -14,
    ...overrides,
  };
}

describe('Expired licence visibility on appointment sessions', () => {
  const appointmentManagementRepositoryMock = {
    findScopedActiveDoctorById: jest.fn(),
    listSessionsWithCounts: jest.fn(),
  };
  const authRepositoryMock = { findUserById: jest.fn() };
  const doctorLicenseExpiryServiceMock = { findExpiredLicensesByDoctor: jest.fn() };
  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };
  let service: AppointmentManagementService;

  function mockActor(permissions: SeededPermission[]): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-1',
      roles: [{ role: { permissions: permissions.map((permission) => ({ permission })) } }],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    appointmentManagementRepositoryMock.findScopedActiveDoctorById.mockResolvedValue({
      id: DOCTOR_ID,
      schedules: [
        {
          id: 'schedule-1',
          dayOfWeek: 4,
          startTime: '08:00',
          endTime: '12:00',
          isAvailable: true,
          maxPatients: 10,
        },
      ],
    });
    appointmentManagementRepositoryMock.listSessionsWithCounts.mockResolvedValue([]);
    doctorLicenseExpiryServiceMock.findExpiredLicensesByDoctor.mockResolvedValue(
      new Map([[DOCTOR_ID, [buildExpiredLicence()]]]),
    );
    service = new AppointmentManagementService(
      appointmentManagementRepositoryMock as unknown as AppointmentManagementRepository,
      authRepositoryMock as unknown as AuthRepository,
      {} as unknown as DoctorPatientService,
      doctorLicenseExpiryServiceMock as unknown as DoctorLicenseExpiryService,
      {} as unknown as NotificationService,
      configServiceMock as unknown as ConfigService,
    );
  });

  async function listSessionsAs(permissions: SeededPermission[]) {
    mockActor(permissions);
    return service.listDoctorSessions(
      DOCTOR_ID,
      { from: '2026-09-03', to: '2026-09-04' },
      { sub: 'actor-1', email: 'actor@hms.test' } as never,
    );
  }

  it('names the lapsed licence and its expiry for a scheduler', async () => {
    const actualSessions = await listSessionsAs(ADMIN_PERMISSIONS);

    expect(actualSessions[0]?.expiredLicenses).toEqual([
      { type: 'SIP', licenseNumber: 'SIP-EXAMPLE-0001', expiresAt: '2026-08-20' },
    ]);
  });

  it('leaves the field absent for a patient, who holds the same session read scope', async () => {
    const actualSessions = await listSessionsAs(PATIENT_PERMISSIONS);

    // Absent, not `[]`. An empty array would claim "this doctor has no lapsed
    // licence"; the true statement is "you are not being told about
    // licences", and only absence says that.
    expect(actualSessions[0]).not.toHaveProperty('expiredLicenses');
    expect(doctorLicenseExpiryServiceMock.findExpiredLicensesByDoctor).not.toHaveBeenCalled();
  });

  it('leaves the field absent for a doctor reading their own sessions', async () => {
    const actualSessions = await listSessionsAs(DOCTOR_PERMISSIONS);

    expect(actualSessions[0]).not.toHaveProperty('expiredLicenses');
  });

  it('sends an empty array, not an absent field, when a scheduler’s doctor is fully licensed', async () => {
    doctorLicenseExpiryServiceMock.findExpiredLicensesByDoctor.mockResolvedValue(new Map());

    const actualSessions = await listSessionsAs(ADMIN_PERMISSIONS);

    expect(actualSessions[0]?.expiredLicenses).toEqual([]);
  });

  it('lists both when STR and SIP have lapsed', async () => {
    doctorLicenseExpiryServiceMock.findExpiredLicensesByDoctor.mockResolvedValue(
      new Map([
        [
          DOCTOR_ID,
          [
            buildExpiredLicence({ type: 'STR', licenseNumber: 'STR-EXAMPLE-0002' }),
            buildExpiredLicence({ type: 'SIP' }),
          ],
        ],
      ]),
    );

    const actualSessions = await listSessionsAs(ADMIN_PERMISSIONS);

    expect(actualSessions[0]?.expiredLicenses?.map((licence) => licence.type)).toEqual([
      'STR',
      'SIP',
    ]);
  });
});
