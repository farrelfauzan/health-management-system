import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { ClinicalRequestDocumentService } from '../../clinical-request-document/service/clinical-request-document.service';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { DeliveryRecordRepository } from '../repository/delivery-record.repository';
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { DeliveryRecordService } from './delivery-record.service';

/**
 * P25-T09. The two authority rules, and the certificate's refusals.
 *
 * The pair of rules is the interesting part: one refuses a *claim* a midwife
 * may not make, the other refuses a *record* that would stand as though the
 * clinic handled alone something it must refer on. Neither refuses a clinical
 * fact.
 */
describe('DeliveryRecordService (P25-T09)', () => {
  const EPISODE_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
  const MIDWIFE_ID = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const DOCTOR_ID = '2f2f1df9-0bd8-4f6a-91f6-d8e35b2cf8d4';
  const currentUser = { sub: 'user-1' } as CurrentUser;

  const deliveryRepositoryMock = {
    findByEpisodeId: jest.fn(),
    findById: jest.fn(),
    findNewbornById: jest.fn(),
    createDelivery: jest.fn(),
    updateDelivery: jest.fn(),
    createNewborn: jest.fn(),
    updateNewborn: jest.fn(),
    listTakenBirthOrders: jest.fn(),
    findAttendant: jest.fn(),
  } as unknown as DeliveryRecordRepository;
  const maternalRepositoryMock = {
    findEpisodeById: jest.fn(),
    findLetterPatient: jest.fn(),
  } as unknown as MaternalCareRepository;
  const encounterAccessMock = {
    resolveScopeOrThrow: jest.fn(),
  } as unknown as EncounterAccessService;
  const documentServiceMock = {
    renderAndFile: jest.fn(),
  } as unknown as ClinicalRequestDocumentService;
  const auditServiceMock = { record: jest.fn() } as unknown as AuditService;
  const clinicProfileServiceMock = {
    getDocumentLetterhead: jest.fn().mockResolvedValue({
      name: 'Klinik Bidan Sehat',
      legalName: null,
      address: 'Jl. Merdeka No. 12, Bandung',
      phoneNumber: '(022) 1234567',
      email: null,
      licenseNumber: '440/1234/DPMPTSP',
      taxId: null,
      logoDataUri: null,
    }),
  } as unknown as ClinicProfileService;

  const service = new DeliveryRecordService(
    deliveryRepositoryMock,
    maternalRepositoryMock,
    encounterAccessMock,
    documentServiceMock,
    auditServiceMock,
    clinicProfileServiceMock,
    new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' }),
  );

  function buildStoredDelivery(overrides: Record<string, unknown> = {}) {
    return {
      id: 'delivery-1',
      pregnancyEpisodeId: EPISODE_ID,
      admissionId: null,
      attendantDoctorId: MIDWIFE_ID,
      attendantDoctor: { fullName: 'Bidan Siti' },
      uterotonic: null,
      labourOnsetAt: null,
      fullDilatationAt: null,
      birthAt: new Date('2026-11-08T20:10:00.000Z'),
      placentaDeliveredAt: null,
      postpartumMonitoringEndedAt: null,
      mode: 'SPONTANEOUS_VAGINAL',
      episiotomy: false,
      perinealTearGrade: 'NONE',
      uterotonicMedicationId: null,
      uterotonicGivenAt: null,
      bloodLossMl: null,
      placentaComplete: null,
      referredOut: false,
      referralReason: null,
      notes: null,
      newbornCareRecords: [],
      ...overrides,
    };
  }

  function buildPayload(overrides: Record<string, unknown> = {}) {
    return {
      attendantDoctorId: MIDWIFE_ID,
      birthAt: '2026-11-08T20:10:00.000Z',
      mode: 'SPONTANEOUS_VAGINAL' as const,
      episiotomy: false,
      perinealTearGrade: 'NONE' as const,
      referredOut: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (maternalRepositoryMock.findEpisodeById as jest.Mock).mockResolvedValue({
      id: EPISODE_ID,
      patientId: 'patient-1',
    });
    (deliveryRepositoryMock.findAttendant as jest.Mock).mockResolvedValue({
      id: MIDWIFE_ID,
      fullName: 'Bidan Siti',
      profession: 'MIDWIFE',
    });
    (deliveryRepositoryMock.createDelivery as jest.Mock).mockResolvedValue(buildStoredDelivery());
    (deliveryRepositoryMock.listTakenBirthOrders as jest.Mock).mockResolvedValue([]);
  });

  describe('a midwife may record a spontaneous vaginal birth only', () => {
    it('records the one she may', async () => {
      const actual = await service.recordDelivery(
        EPISODE_ID,
        buildPayload(),
        currentUser,
      );

      expect(actual.id).toBe('delivery-1');
      expect(deliveryRepositoryMock.createDelivery).toHaveBeenCalledTimes(1);
    });

    it.each(['CAESAREAN', 'ASSISTED_VAGINAL'] as const)('refuses %s', async (mode) => {
      await expect(
        service.recordDelivery(EPISODE_ID, buildPayload({ mode }), currentUser),
      ).rejects.toMatchObject({
        response: { code: 'MIDWIFE_DELIVERY_MODE_OUT_OF_AUTHORITY' },
      });
      expect(deliveryRepositoryMock.createDelivery).not.toHaveBeenCalled();
    });

    it('records a caesarean when a doctor is named as the attendant', async () => {
      (deliveryRepositoryMock.findAttendant as jest.Mock).mockResolvedValue({
        id: DOCTOR_ID,
        fullName: 'dr. Olivia Kirana, Sp.OG',
        profession: 'DOCTOR',
      });

      await service.recordDelivery(
        EPISODE_ID,
        buildPayload({ attendantDoctorId: DOCTOR_ID, mode: 'CAESAREAN' }),
        currentUser,
      );

      expect(deliveryRepositoryMock.createDelivery).toHaveBeenCalledTimes(1);
    });
  });

  describe('a severe tear is recorded, but never left unreferred', () => {
    it.each(['GRADE_3', 'GRADE_4'] as const)('refuses %s with no referral', async (grade) => {
      await expect(
        service.recordDelivery(
          EPISODE_ID,
          buildPayload({ perinealTearGrade: grade }),
          currentUser,
        ),
      ).rejects.toMatchObject({ response: { code: 'DELIVERY_REFERRAL_REQUIRED' } });
    });

    it('records a grade 3 tear that was referred on', async () => {
      await service.recordDelivery(
        EPISODE_ID,
        buildPayload({
          perinealTearGrade: 'GRADE_3',
          referredOut: true,
          referralReason: 'RSUD, perbaikan ruptur',
        }),
        currentUser,
      );

      expect(deliveryRepositoryMock.createDelivery).toHaveBeenCalledTimes(1);
    });

    it('records a grade 2 tear without asking for a referral', async () => {
      await service.recordDelivery(
        EPISODE_ID,
        buildPayload({ perinealTearGrade: 'GRADE_2' }),
        currentUser,
      );

      expect(deliveryRepositoryMock.createDelivery).toHaveBeenCalledTimes(1);
    });
  });

  describe('twins', () => {
    it("reads each baby's position from wherever it lives", async () => {
      (deliveryRepositoryMock.findByEpisodeId as jest.Mock).mockResolvedValue(
        buildStoredDelivery({
          newbornCareRecords: [
            {
              id: 'baby-1',
              outcome: 'LIVE_BIRTH',
              stillbirthOrder: null,
              newbornPatientId: 'patient-baby-1',
              newbornPatient: { fullName: 'Bayi Ny. Rina I', birthOrder: 1 },
              sex: 'FEMALE',
              birthWeightGrams: 2400,
              lengthCm: null,
              headCircumferenceCm: null,
              apgar1Min: 8,
              apgar5Min: 9,
              imdStartedAt: null,
              imdDurationMinutes: null,
              cordCareAt: null,
              vitaminK1GivenAt: null,
              eyeProphylaxisGivenAt: null,
              hb0ImmunizationId: null,
              examinedAt: null,
              identityTagAt: null,
            },
            {
              id: 'baby-2',
              outcome: 'STILLBIRTH',
              stillbirthOrder: 2,
              newbornPatientId: null,
              newbornPatient: null,
              sex: 'MALE',
              birthWeightGrams: 2100,
              lengthCm: null,
              headCircumferenceCm: null,
              apgar1Min: null,
              apgar5Min: null,
              imdStartedAt: null,
              imdDurationMinutes: null,
              cordCareAt: null,
              vitaminK1GivenAt: null,
              eyeProphylaxisGivenAt: null,
              hb0ImmunizationId: null,
              examinedAt: null,
              identityTagAt: null,
            },
          ],
        }),
      );

      const actual = await service.getDelivery(EPISODE_ID, currentUser);

      // One position per baby, read from the patient record for the live twin
      // and from the care record for the stillborn one — never two copies.
      expect(actual?.newborns.map((baby) => baby.birthOrder)).toEqual([1, 2]);
    });

    it('refuses a stillborn twin taking a position a live one already holds', async () => {
      (deliveryRepositoryMock.findById as jest.Mock).mockResolvedValue(buildStoredDelivery());
      (deliveryRepositoryMock.listTakenBirthOrders as jest.Mock).mockResolvedValue([1]);

      await expect(
        service.recordNewborn(
          'delivery-1',
          { outcome: 'STILLBIRTH', stillbirthOrder: 1, sex: 'MALE' },
          currentUser,
        ),
      ).rejects.toMatchObject({ response: { code: 'NEWBORN_BIRTH_ORDER_TAKEN' } });
    });
  });

  describe('the surat keterangan lahir', () => {
    function arrangeNewborn(overrides: Record<string, unknown> = {}): void {
      (deliveryRepositoryMock.findNewbornById as jest.Mock).mockResolvedValue({
        id: 'baby-1',
        outcome: 'LIVE_BIRTH',
        newbornPatientId: 'patient-baby-1',
        newbornPatient: { fullName: 'Bayi Ny. Rina', birthOrder: 2 },
        sex: 'FEMALE',
        birthWeightGrams: 3200,
        lengthCm: 49,
        deliveryRecord: {
          id: 'delivery-1',
          birthAt: new Date('2026-11-08T20:10:00.000Z'),
          pregnancyEpisodeId: EPISODE_ID,
          attendantDoctor: {
            fullName: 'Bidan Siti Rahma, S.Tr.Keb.',
            licenseNumber: 'BD00000000000002',
            licenses: [{ licenseNumber: '21 1 1 2 3 24-123456' }],
          },
          pregnancyEpisode: { patientId: 'patient-1' },
        },
        ...overrides,
      });
      (maternalRepositoryMock.findLetterPatient as jest.Mock).mockResolvedValue({
        fullName: 'Rina Wijaya',
        mrn: 'MRN-1',
        dateOfBirth: null,
        sex: 'FEMALE',
        address: null,
        nikLast4: '3204',
      });
      (documentServiceMock.renderAndFile as jest.Mock).mockResolvedValue({
        documentId: 'doc-1',
        title: 'Surat Keterangan Lahir — Bayi Ny. Rina',
        renderedAt: '2026-11-08T21:00:00.000Z',
      });
    }

    it('files it on the baby, not the mother, and signs it with the attendant’s STR', async () => {
      arrangeNewborn();

      const actual = await service.issueBirthCertificate('baby-1', currentUser);

      expect(actual.kind).toBe('BIRTH_CERTIFICATE');
      const [context] = (documentServiceMock.renderAndFile as jest.Mock).mock.calls[0] as [
        { patientId: string; values: Record<string, string> },
      ];
      expect(context.patientId).toBe('patient-baby-1');
      expect(context.values['attendant.strNumber']).toBe('21 1 1 2 3 24-123456');
      // The birth is printed in clinic time: 20:10Z is 03:10 the next day in
      // Jakarta, which is the date the family registers her under.
      expect(context.values['baby.birthDate']).toBe('Senin, 9 November 2026');
      expect(context.values['baby.birthTime']).toBe('03:10');
      expect(context.values['mother.nikMasked']).toBe('************3204');
    });

    it('prints it under the clinic letterhead, born at the clinic', async () => {
      arrangeNewborn();

      await service.issueBirthCertificate('baby-1', currentUser);

      const calls = (documentServiceMock.renderAndFile as jest.Mock).mock.calls;
      const [context] = calls[calls.length - 1] as [{ values: Record<string, string> }];
      expect(context.values['clinic.name']).toBe('Klinik Bidan Sehat');
      expect(context.values['clinic.address']).toBe('Jl. Merdeka No. 12, Bandung');
      expect(context.values['birth.place']).toBe('Klinik Bidan Sehat, Jl. Merdeka No. 12, Bandung');
    });

    it('refuses one for a stillbirth — that family needs a different document', async () => {
      arrangeNewborn({ outcome: 'STILLBIRTH', newbornPatientId: null, newbornPatient: null });

      await expect(service.issueBirthCertificate('baby-1', currentUser)).rejects.toMatchObject({
        response: { code: 'BIRTH_CERTIFICATE_LIVE_BIRTH_ONLY' },
      });
      expect(documentServiceMock.renderAndFile).not.toHaveBeenCalled();
    });

    it('refuses one until the baby has a record to file it on', async () => {
      arrangeNewborn({ newbornPatientId: null, newbornPatient: null });

      await expect(service.issueBirthCertificate('baby-1', currentUser)).rejects.toMatchObject({
        response: { code: 'NEWBORN_NOT_REGISTERED' },
      });
    });

    // D-032: the flat profile number is the STR, so an attendant with no typed
    // STR row still signs under a real number rather than a dash.
    it('falls back to the profile’s flat number when no STR row is on file', async () => {
      arrangeNewborn();
      (deliveryRepositoryMock.findNewbornById as jest.Mock).mockResolvedValue({
        ...(await (deliveryRepositoryMock.findNewbornById as jest.Mock)()),
        deliveryRecord: {
          id: 'delivery-1',
          birthAt: new Date('2026-11-08T20:10:00.000Z'),
          pregnancyEpisodeId: EPISODE_ID,
          attendantDoctor: {
            fullName: 'Bidan Siti Rahma, S.Tr.Keb.',
            licenseNumber: 'BD00000000000002',
            licenses: [],
          },
          pregnancyEpisode: { patientId: 'patient-1' },
        },
      });

      await service.issueBirthCertificate('baby-1', currentUser);

      const calls = (documentServiceMock.renderAndFile as jest.Mock).mock.calls;
      const [context] = calls[calls.length - 1] as [{ values: Record<string, string> }];
      expect(context.values['attendant.strNumber']).toBe('BD00000000000002');
    });
  });

  it('throws UnprocessableEntityException, so the route answers 422', async () => {
    await expect(
      service.recordDelivery(EPISODE_ID, buildPayload({ mode: 'CAESAREAN' }), currentUser),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
