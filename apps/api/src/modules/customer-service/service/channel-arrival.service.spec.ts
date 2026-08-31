import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChannelArrivalRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ChannelArrivalRepository } from '../repository/channel-arrival.repository';
import { ChannelArrivalService } from './channel-arrival.service';

describe('ChannelArrivalService', () => {
  let mockRepository: jest.Mocked<
    Pick<
      ChannelArrivalRepository,
      'listArrivals' | 'findArrivalPatientById' | 'countClinicalRecords' | 'mergeDraftIntoPatient'
    >
  >;
  let channelArrivalService: ChannelArrivalService;

  const actor: CurrentUser = { sub: 'admin-user-1' } as unknown as CurrentUser;

  function buildArrival(overrides: Partial<ChannelArrivalRecord> = {}): ChannelArrivalRecord {
    return {
      appointmentId: 'appointment-1',
      bookingReferenceCode: 'SJ-7QK4M2',
      channel: 'TELEGRAM',
      scheduledAt: '2026-08-09T01:00:00.000Z',
      appointmentStatus: 'SCHEDULED',
      doctorName: 'dr. Andi',
      specialty: 'Dokter Umum',
      subjectKind: 'PATIENT',
      patientId: 'patient-draft',
      patientMrn: 'RM-000482',
      patientSource: 'CHANNEL_BOOKING',
      prospectivePatientId: null,
      patientFullName: 'Rina',
      patientPhoneNumber: '628123456789',
      missingFields: ['dateOfBirth', 'address', 'nik'],
      createdAt: '2026-08-08T14:22:00.000Z',
      ...overrides,
    };
  }

  /** A booking taken after `P17-T03`: no patient record, no MRN spent. */
  function buildProspectiveArrival(
    overrides: Partial<ChannelArrivalRecord> = {},
  ): ChannelArrivalRecord {
    return buildArrival({
      appointmentId: 'appointment-2',
      subjectKind: 'PROSPECTIVE_PATIENT',
      patientId: null,
      patientMrn: null,
      patientSource: null,
      prospectivePatientId: 'prospective-1',
      patientFullName: 'Siti Rahayu',
      missingFields: ['dateOfBirth', 'sex', 'address', 'nik', 'bpjsNumber'],
      ...overrides,
    });
  }

  function buildPatient(overrides: Record<string, unknown> = {}) {
    return {
      id: 'patient-draft',
      mrn: 'RM-000482',
      fullName: 'Rina',
      phoneNumber: '628123456789',
      source: 'CHANNEL_BOOKING' as const,
      dateOfBirth: null,
      sex: null,
      address: null,
      nikIndex: null,
      bpjsNumberIndex: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    mockRepository = {
      listArrivals: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      findArrivalPatientById: jest.fn(),
      countClinicalRecords: jest.fn().mockResolvedValue(0),
      mergeDraftIntoPatient: jest.fn().mockResolvedValue({
        movedAppointments: 1,
        movedRegistrations: 0,
        movedChannelLinks: 1,
      }),
    };
    channelArrivalService = new ChannelArrivalService(
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' }),
      mockRepository as unknown as ChannelArrivalRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the worklist', () => {
    it('covers the whole requested day, not just its first instant', async () => {
      await channelArrivalService.listArrivals({ from: '2026-08-09', limit: 25 });

      expect(mockRepository.listArrivals).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-08-09T00:00:00.000Z',
          to: '2026-08-10T00:00:00.000Z',
        }),
      );
    });

    it('marks a draft missing the two columns a chat cannot fill', async () => {
      mockRepository.listArrivals.mockResolvedValue({
        items: [buildArrival()],
        nextCursor: null,
      });

      const actual = await channelArrivalService.listArrivals({ limit: 25 });

      expect(actual.items[0]?.patientIsDraft).toBe(true);
    });

    it('clears a completed draft even when identifiers are still absent', async () => {
      mockRepository.listArrivals.mockResolvedValue({
        items: [buildArrival({ missingFields: ['nik', 'bpjsNumber'] })],
        nextCursor: null,
      });

      const actual = await channelArrivalService.listArrivals({ limit: 25 });

      // A patient may genuinely have no BPJS coverage and no card on them. A
      // worklist that never clears is a worklist people stop reading — so the
      // identifiers are still reported, but they do not hold the row open.
      expect(actual.items[0]?.patientIsDraft).toBe(false);
      expect(actual.items[0]?.missingFields).toEqual(['nik', 'bpjsNumber']);
    });

    it('holds a prospective booking open and carries no patient id', async () => {
      mockRepository.listArrivals.mockResolvedValue({
        items: [buildProspectiveArrival()],
        nextCursor: null,
      });

      const actual = await channelArrivalService.listArrivals({ limit: 25 });

      // Incomplete by construction: the table holds a name and a phone number
      // and has no column a date of birth could have come from.
      expect(actual.items[0]?.patientIsDraft).toBe(true);
      expect(actual.items[0]?.subjectKind).toBe('PROSPECTIVE_PATIENT');
      // Null, not a blank string — there is no record and no MRN was spent, and
      // the desk converts against `prospectivePatientId` instead.
      expect(actual.items[0]?.patientId).toBeNull();
      expect(actual.items[0]?.patientMrn).toBeNull();
      expect(actual.items[0]?.prospectivePatientId).toBe('prospective-1');
      expect(actual.items[0]?.patientFullName).toBe('Siti Rahayu');
    });

    it('lists a legacy draft and a prospective booking side by side', async () => {
      // Both shapes coexist until `P17-T05` drains the old ones, and the desk
      // sees one worklist rather than two screens.
      mockRepository.listArrivals.mockResolvedValue({
        items: [buildArrival(), buildProspectiveArrival()],
        nextCursor: null,
      });

      const actual = await channelArrivalService.listArrivals({ limit: 25 });

      expect(actual.items.map((item) => item.subjectKind)).toEqual([
        'PATIENT',
        'PROSPECTIVE_PATIENT',
      ]);
      expect(actual.items.every((item) => item.patientIsDraft)).toBe(true);
    });

    it('does not mark a verified customer’s booking as a draft', async () => {
      mockRepository.listArrivals.mockResolvedValue({
        items: [buildArrival({ patientSource: 'FRONT_DESK', missingFields: ['bpjsNumber'] })],
        nextCursor: null,
      });

      const actual = await channelArrivalService.listArrivals({ limit: 25 });

      // The booking still appears — the desk wants to know it came from a
      // phone — but there is nothing for anyone to complete.
      expect(actual.items[0]?.patientIsDraft).toBe(false);
    });
  });

  describe('merging a draft', () => {
    it('moves the bookings and reports what it moved', async () => {
      mockRepository.findArrivalPatientById
        .mockResolvedValueOnce(buildPatient())
        .mockResolvedValueOnce(
          buildPatient({ id: 'patient-real', source: 'FRONT_DESK', dateOfBirth: new Date() }),
        );

      const actual = await channelArrivalService.mergeDraftPatient(
        'patient-draft',
        { targetPatientId: 'patient-real' },
        actor,
      );

      expect(actual.movedAppointments).toBe(1);
      expect(mockRepository.mergeDraftIntoPatient).toHaveBeenCalledWith(
        expect.objectContaining({
          draftPatientId: 'patient-draft',
          targetPatientId: 'patient-real',
        }),
      );
    });

    it('refuses to merge a record into itself', async () => {
      await expect(
        channelArrivalService.mergeDraftPatient(
          'patient-draft',
          { targetPatientId: 'patient-draft' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.findArrivalPatientById).not.toHaveBeenCalled();
    });

    it('refuses to merge a front-desk record, which is a different operation', async () => {
      mockRepository.findArrivalPatientById.mockResolvedValueOnce(
        buildPatient({ source: 'FRONT_DESK' }),
      );

      await expect(
        channelArrivalService.mergeDraftPatient(
          'patient-draft',
          { targetPatientId: 'patient-real' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.mergeDraftIntoPatient).not.toHaveBeenCalled();
    });

    it('refuses a target that is itself a draft', async () => {
      mockRepository.findArrivalPatientById
        .mockResolvedValueOnce(buildPatient())
        .mockResolvedValueOnce(buildPatient({ id: 'patient-other-draft' }));

      await expect(
        channelArrivalService.mergeDraftPatient(
          'patient-draft',
          { targetPatientId: 'patient-other-draft' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses once the draft has clinical history', async () => {
      mockRepository.findArrivalPatientById
        .mockResolvedValueOnce(buildPatient())
        .mockResolvedValueOnce(buildPatient({ id: 'patient-real', source: 'FRONT_DESK' }));
      mockRepository.countClinicalRecords.mockResolvedValue(1);

      await expect(
        channelArrivalService.mergeDraftPatient(
          'patient-draft',
          { targetPatientId: 'patient-real' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Moving encounters and prescriptions between patients is not something
      // a front-desk button gets to do silently.
      expect(mockRepository.mergeDraftIntoPatient).not.toHaveBeenCalled();
    });

    it('404s on a target that does not exist', async () => {
      mockRepository.findArrivalPatientById
        .mockResolvedValueOnce(buildPatient())
        .mockResolvedValueOnce(null);

      await expect(
        channelArrivalService.mergeDraftPatient(
          'patient-draft',
          { targetPatientId: 'missing' },
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
