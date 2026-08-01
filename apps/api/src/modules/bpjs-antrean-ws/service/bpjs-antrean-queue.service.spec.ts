import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsAntreanServiceError } from '../bpjs-antrean-service.error';
import { BpjsAntreanQueueService } from './bpjs-antrean-queue.service';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { BpjsAntreanScheduleResolver } from './bpjs-antrean-schedule-resolver.service';

const ACTOR: CurrentUser = { sub: 'system-actor-id', email: 'bridge@system.hms.local' };

const SCHEDULE = {
  specialtyId: 'specialty-1',
  poliName: 'Umum',
  doctorId: 'doctor-1',
  doctorName: 'dr. Andi',
  session: {
    id: 'session-1',
    scheduleId: 'schedule-1',
    doctorId: 'doctor-1',
    sessionDate: '2026-08-10',
    startTime: '08:00',
    endTime: '12:00',
    status: 'OPEN' as const,
    maxPatients: 20,
    bookedCount: 4,
    remaining: 16,
  },
};

const TAKE_REQUEST = {
  kodepoli: '001',
  kodedokter: 'D01',
  tanggalperiksa: '2026-08-10',
  jampraktek: '08:00-12:00',
  nomorkartu: '0001234567890',
  nik: '3201011234567890',
  nohp: '081200000000',
};

function buildService(overrides: {
  scheduleResolver?: Partial<BpjsAntreanScheduleResolver>;
  appointmentService?: Partial<AppointmentManagementService>;
  patientService?: Partial<PatientManagementService>;
}) {
  const scheduleResolver = {
    resolve: jest.fn().mockResolvedValue(SCHEDULE),
    ...overrides.scheduleResolver,
  } as unknown as BpjsAntreanScheduleResolver;
  const appointmentService = {
    getSessionQueue: jest.fn().mockResolvedValue({ queue: [] }),
    bookSessionForBpjsAntrean: jest.fn(),
    getAppointmentByBpjsBookingCode: jest.fn(),
    cancelAppointment: jest.fn().mockResolvedValue(undefined),
    ...overrides.appointmentService,
  } as unknown as AppointmentManagementService;
  const patientService = {
    listPatients: jest.fn().mockResolvedValue({ items: [] }),
    getPatientById: jest.fn(),
    ...overrides.patientService,
  } as unknown as PatientManagementService;
  const inboundConfig = { averageServiceMinutes: 15 } as BpjsAntreanInboundConfig;
  return {
    service: new BpjsAntreanQueueService(
      scheduleResolver,
      appointmentService,
      patientService,
      inboundConfig,
    ),
    appointmentService,
    patientService,
  };
}

describe('BpjsAntreanQueueService', () => {
  describe('getStatus', () => {
    it('reports the session as open with its remaining capacity', async () => {
      const { service } = buildService({
        appointmentService: {
          getSessionQueue: jest.fn().mockResolvedValue({
            queue: [
              { queueNumber: 1, status: 'COMPLETED' },
              { queueNumber: 2, status: 'SCHEDULED' },
              { queueNumber: 3, status: 'CONFIRMED' },
            ],
          }),
        },
      });

      const actual = await service.getStatus(
        {
          kodepoli: '001',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
        },
        ACTOR,
      );

      expect(actual).toMatchObject({
        namapoli: 'Umum',
        namadokter: 'dr. Andi',
        totalantrean: 4,
        sisaantrean: 2,
        // §3.5: HMS records no "called" event, so this lags by one patient and
        // reports the furthest-progressed booking instead.
        antreanpanggil: '1',
        keterangan: 'Pendaftaran dibuka',
      });
    });

    it('reports a closed session rather than accepting bookings for it', async () => {
      const { service } = buildService({
        scheduleResolver: {
          resolve: jest
            .fn()
            .mockResolvedValue({ ...SCHEDULE, session: { ...SCHEDULE.session, status: 'CLOSED' } }),
        },
      });

      const actual = await service.getStatus(
        {
          kodepoli: '001',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
        },
        ACTOR,
      );

      expect(actual.keterangan).toBe('Pendaftaran ditutup');
    });

    it('treats a schedule window nobody has booked as an empty queue', async () => {
      // No materialised session row is the normal state for a future shift.
      // Erroring here would refuse Mobile JKN for every doctor whose day has
      // not started.
      const { service, appointmentService } = buildService({
        scheduleResolver: {
          resolve: jest.fn().mockResolvedValue({
            ...SCHEDULE,
            session: { ...SCHEDULE.session, id: null, bookedCount: 0, remaining: 20 },
          }),
        },
      });

      const actual = await service.getStatus(
        {
          kodepoli: '001',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
        },
        ACTOR,
      );

      expect(actual.sisaantrean).toBe(0);
      expect(actual.antreanpanggil).toBe('-');
      expect(appointmentService.getSessionQueue).not.toHaveBeenCalled();
    });
  });

  describe('takeQueueNumber', () => {
    it('books the member and answers with the queue number and booking code', async () => {
      const { service, appointmentService } = buildService({
        patientService: {
          listPatients: jest.fn().mockResolvedValue({ items: [{ id: 'patient-1' }] }),
          getPatientById: jest.fn().mockResolvedValue({ id: 'patient-1', mrn: '00000042' }),
        },
        appointmentService: {
          bookSessionForBpjsAntrean: jest.fn().mockResolvedValue({
            queueNumber: 5,
            appointment: { scheduledAt: '2026-08-10T01:00:00.000Z' },
          }),
        },
      });

      const actual = await service.takeQueueNumber(TAKE_REQUEST, ACTOR);

      expect(actual.angkaantrean).toBe(5);
      expect(actual.nomorantrean).toBe('001-5');
      expect(actual.norm).toBe('00000042');
      expect(actual.kodebooking).toMatch(/^001-20260810-[0-9A-F]{10}$/);
      // Four patients ahead × 15 minutes from the session start.
      expect(actual.estimasidilayani).toBe(
        new Date('2026-08-10T01:00:00.000Z').getTime() + 4 * 15 * 60_000,
      );
      expect(actual.sisakuotajkn).toBe(15);
      expect(jest.mocked(appointmentService.bookSessionForBpjsAntrean)).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-1', scheduleId: 'schedule-1' }),
        ACTOR,
      );
    });

    it('refuses legibly when the member has no record at this clinic', async () => {
      // `ambil antrean` never creates a patient — that is `pasien baru`'s job.
      // A booking call that silently minted a patient row would be the most
      // expensive thing this surface can do, from the cheapest mistake.
      const { service, appointmentService } = buildService({});

      await expect(service.takeQueueNumber(TAKE_REQUEST, ACTOR)).rejects.toThrow(
        BpjsAntreanServiceError,
      );
      expect(appointmentService.bookSessionForBpjsAntrean).not.toHaveBeenCalled();
    });

    it('matches the member by NIK when the card number finds nothing', async () => {
      const listPatients = jest
        .fn()
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [{ id: 'patient-2' }] });
      const { service } = buildService({
        patientService: {
          listPatients,
          getPatientById: jest.fn().mockResolvedValue({ id: 'patient-2', mrn: '00000043' }),
        },
        appointmentService: {
          bookSessionForBpjsAntrean: jest.fn().mockResolvedValue({
            queueNumber: 1,
            appointment: { scheduledAt: '2026-08-10T01:00:00.000Z' },
          }),
        },
      });

      const actual = await service.takeQueueNumber(TAKE_REQUEST, ACTOR);

      expect(actual.norm).toBe('00000043');
      expect(listPatients).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ bpjsNumber: '0001234567890' }),
        ACTOR,
      );
      expect(listPatients).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ nik: '3201011234567890' }),
        ACTOR,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a scheduled booking through the domain service', async () => {
      const cancelAppointment = jest.fn().mockResolvedValue(undefined);
      const { service } = buildService({
        appointmentService: {
          getAppointmentByBpjsBookingCode: jest
            .fn()
            .mockResolvedValue({ id: 'appointment-1', status: 'SCHEDULED' }),
          cancelAppointment,
        },
      });

      const actual = await service.cancel(
        { kodebooking: '001-20260810-ABCDEF0123', keterangan: 'Peserta membatalkan' },
        ACTOR,
      );

      expect(actual).toBe('appointment-1');
      expect(cancelAppointment).toHaveBeenCalledWith(
        'appointment-1',
        { reason: 'Peserta membatalkan' },
        ACTOR,
      );
    });

    it('refuses to cancel a booking that has already been served', async () => {
      const { service } = buildService({
        appointmentService: {
          getAppointmentByBpjsBookingCode: jest
            .fn()
            .mockResolvedValue({ id: 'appointment-1', status: 'COMPLETED' }),
        },
      });

      await expect(
        service.cancel({ kodebooking: 'code', keterangan: 'terlambat' }, ACTOR),
      ).rejects.toThrow(/tidak dapat dibatalkan/);
    });

    it('turns an unknown booking code into a readable refusal', async () => {
      const { service } = buildService({
        appointmentService: {
          getAppointmentByBpjsBookingCode: jest.fn().mockRejectedValue(new Error('not found')),
        },
      });

      await expect(
        service.cancel({ kodebooking: 'missing', keterangan: 'batal' }, ACTOR),
      ).rejects.toThrow(/tidak ditemukan/);
    });
  });

  describe('getRemaining', () => {
    it('counts only the bookings ahead of this one', async () => {
      const { service } = buildService({
        appointmentService: {
          getAppointmentByBpjsBookingCode: jest.fn().mockResolvedValue({
            id: 'appointment-3',
            sessionId: 'session-1',
            queueNumber: 3,
            status: 'SCHEDULED',
            doctor: { fullName: 'dr. Andi', specialty: 'Umum' },
          }),
          getSessionQueue: jest.fn().mockResolvedValue({
            queue: [
              { queueNumber: 1, status: 'COMPLETED' },
              { queueNumber: 2, status: 'CANCELLED' },
              { queueNumber: 3, status: 'SCHEDULED' },
              { queueNumber: 4, status: 'SCHEDULED' },
            ],
          }),
        },
      });

      const actual = await service.getRemaining({ kodebooking: 'code' }, ACTOR);

      // Number 2 cancelled, so only number 1 is genuinely ahead.
      expect(actual.sisaantrean).toBe(1);
      expect(actual.waktutunggu).toBe(15);
      expect(actual.namapoli).toBe('Umum');
    });
  });
});
