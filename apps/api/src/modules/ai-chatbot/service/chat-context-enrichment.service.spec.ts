import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { RegistrationFlowService } from '../../registration-flow/service/registration-flow.service';
import { ChatContextEnrichmentService } from './chat-context-enrichment.service';

describe('ChatContextEnrichmentService', () => {
  const listPatientsMock = jest.fn();
  const listAppointmentsMock = jest.fn();
  const listRegistrationsMock = jest.fn();

  const inputActor: CurrentUser = { sub: 'user-patient', email: 'patient@hms.local' };

  function buildService(
    env: Record<string, string> = { AI_CHAT_CONTEXT_ENRICHMENT_ENABLED: 'true' },
  ): ChatContextEnrichmentService {
    return new ChatContextEnrichmentService(
      { listPatients: listPatientsMock } as unknown as PatientManagementService,
      { listAppointments: listAppointmentsMock } as unknown as AppointmentManagementService,
      { listRegistrations: listRegistrationsMock } as unknown as RegistrationFlowService,
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta', ...env }),
    );
  }

  function buildAppointment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'appointment-1',
      patientId: 'patient-1',
      doctorId: 'doctor-1',
      status: 'SCHEDULED',
      scheduledAt: '2026-08-13T02:00:00.000Z',
      reason: 'Nyeri kepala sejak tiga hari',
      notes: 'Riwayat hipertensi',
      patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'Budi Santoso' },
      doctor: { id: 'doctor-1', fullName: 'dr. Andi Prasetyo, Sp.PD', specialty: 'Internal Medicine' },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listPatientsMock.mockResolvedValue({
      items: [{ id: 'patient-1', fullName: 'Budi Santoso' }],
      meta: { page: 1, limit: 1, total: 1 },
    });
    listAppointmentsMock.mockResolvedValue({
      items: [buildAppointment()],
      meta: { page: 1, limit: 100, total: 1 },
    });
    listRegistrationsMock.mockResolvedValue({ items: [], meta: { page: 1, limit: 10, total: 0 } });
  });

  it('returns nothing at all when the feature flag is off', async () => {
    const actualContext = await buildService({}).buildContext('PATIENT', inputActor);

    expect(actualContext).toEqual({});
    expect(listPatientsMock).not.toHaveBeenCalled();
    expect(listAppointmentsMock).not.toHaveBeenCalled();
  });

  describe('patient channel', () => {
    it('carries only the §5.3 fields and never the source row’s identifiers or notes', async () => {
      const actualContext = await buildService().buildContext('PATIENT', inputActor);

      expect(actualContext).toEqual({
        displayName: 'Budi Santoso',
        nextAppointment: {
          scheduledAt: '2026-08-13T02:00:00.000Z',
          doctorName: 'dr. Andi Prasetyo, Sp.PD',
          specialty: 'Internal Medicine',
          status: 'SCHEDULED',
        },
      });
      const serialised = JSON.stringify(actualContext);
      expect(serialised).not.toContain('MRN-0001');
      expect(serialised).not.toContain('Nyeri kepala');
      expect(serialised).not.toContain('Riwayat hipertensi');
      expect(serialised).not.toContain('patient-1');
    });

    it('picks the earliest upcoming appointment from a newest-first list', async () => {
      listAppointmentsMock.mockResolvedValue({
        items: [
          buildAppointment({ id: 'later', scheduledAt: '2026-08-20T02:00:00.000Z' }),
          buildAppointment({ id: 'soonest', scheduledAt: '2026-08-13T02:00:00.000Z' }),
        ],
        meta: { page: 1, limit: 100, total: 2 },
      });

      const actualContext = (await buildService().buildContext('PATIENT', inputActor)) as {
        nextAppointment: { scheduledAt: string };
      };

      expect(actualContext.nextAppointment.scheduledAt).toBe('2026-08-13T02:00:00.000Z');
    });

    it.each(['CANCELLED', 'REJECTED', 'NO_SHOW', 'COMPLETED'])(
      'ignores a %s appointment when picking the next one',
      async (status) => {
        listAppointmentsMock.mockResolvedValue({
          items: [buildAppointment({ status })],
          meta: { page: 1, limit: 100, total: 1 },
        });

        const actualContext = await buildService().buildContext('PATIENT', inputActor);

        expect(actualContext).not.toHaveProperty('nextAppointment');
      },
    );

    it('includes today’s queue number and ignores another day’s registration', async () => {
      const todayInJakarta = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      listRegistrationsMock.mockResolvedValue({
        items: [
          { queueDate: '2020-01-01', queueNumber: 99 },
          { queueDate: todayInJakarta, queueNumber: 12 },
        ],
        meta: { page: 1, limit: 10, total: 2 },
      });

      const actualContext = await buildService().buildContext('PATIENT', inputActor);

      expect(actualContext).toMatchObject({ activeQueueNumber: 12 });
    });
  });

  describe('doctor channel', () => {
    it('carries counts and the next slot time, never patient identity', async () => {
      listPatientsMock.mockResolvedValue({
        items: [{ id: 'patient-1', fullName: 'Budi Santoso' }],
        meta: { page: 1, limit: 1, total: 42 },
      });
      listAppointmentsMock.mockResolvedValue({
        items: [buildAppointment()],
        meta: { page: 1, limit: 1, total: 8 },
      });

      const actualContext = await buildService().buildContext('DOCTOR', inputActor);

      expect(actualContext).toEqual({
        todayAppointmentCount: 8,
        nextAppointmentAt: '2026-08-13T02:00:00.000Z',
        assignedPatientCount: 42,
      });
      // The doctor channel must never become a bulk export of assigned
      // patients: a count is allowed, a name is not.
      expect(JSON.stringify(actualContext)).not.toContain('Budi Santoso');
    });
  });

  describe('degradation', () => {
    it('omits a field whose domain read is forbidden rather than failing the chat', async () => {
      listPatientsMock.mockRejectedValue(new ForbiddenException('not allowed'));

      const actualContext = await buildService().buildContext('PATIENT', inputActor);

      expect(actualContext).not.toHaveProperty('displayName');
      expect(actualContext).toHaveProperty('nextAppointment');
    });

    it('returns an empty context when every read fails', async () => {
      listPatientsMock.mockRejectedValue(new Error('database down'));
      listAppointmentsMock.mockRejectedValue(new Error('database down'));
      listRegistrationsMock.mockRejectedValue(new Error('database down'));

      const actualContext = await buildService().buildContext('PATIENT', inputActor);

      expect(actualContext).toEqual({});
    });

    it('reads every domain service as the authenticated user', async () => {
      await buildService().buildContext('PATIENT', inputActor);

      expect(listPatientsMock).toHaveBeenCalledWith(expect.anything(), inputActor);
      expect(listAppointmentsMock).toHaveBeenCalledWith(expect.anything(), inputActor);
      expect(listRegistrationsMock).toHaveBeenCalledWith(expect.anything(), inputActor);
    });

    it('enriches an admin session with nothing at all', async () => {
      // Every field §5.3 allows is about the asking user as a patient or a
      // clinician; none of it means anything for someone running the clinic.
      // An admin's questions are aggregates, answered by tools on request
      // rather than by a payload sent before anyone asked.
      const actualContext = await buildService().buildContext('ADMIN', inputActor);

      expect(actualContext).toEqual({});
      expect(listPatientsMock).not.toHaveBeenCalled();
      expect(listAppointmentsMock).not.toHaveBeenCalled();
      expect(listRegistrationsMock).not.toHaveBeenCalled();
    });
  });
});
