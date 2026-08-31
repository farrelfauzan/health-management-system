import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';

import { ProspectiveMatchCandidateRow } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { ProspectiveArrivalRepository } from '../repository/prospective-arrival.repository';
import { ProspectiveArrivalService } from './prospective-arrival.service';

describe('ProspectiveArrivalService', () => {
  let mockRepository: jest.Mocked<
    Pick<
      ProspectiveArrivalRepository,
      'listByStatus' | 'findById' | 'findPatientSummary' | 'findMatchCandidates' | 'linkToPatient'
    >
  >;
  let mockPatientService: jest.Mocked<Pick<PatientManagementService, 'createPatientFromProspective'>>;
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let identifierCrypto: NationalIdentifierCryptoService;
  let prospectiveArrivalService: ProspectiveArrivalService;

  const actor: CurrentUser = { sub: 'front-desk-user-1' } as unknown as CurrentUser;
  const prospectiveId = '9a1b2c3d-4e5f-4061-8a72-b3c4d5e6f708';

  function buildProspective(overrides: Record<string, unknown> = {}) {
    return {
      id: prospectiveId,
      fullName: 'Siti Rahayu',
      phoneNumber: '628123456789',
      status: 'AWAITING_ARRIVAL' as const,
      patientId: null,
      ...overrides,
    };
  }

  function buildCandidate(
    overrides: Partial<ProspectiveMatchCandidateRow> = {},
  ): ProspectiveMatchCandidateRow {
    return {
      id: 'patient-1',
      mrn: 'RM-000119',
      fullName: 'Siti Rahayu Wulandari',
      phoneNumber: '08123456789',
      dateOfBirth: new Date('1991-03-14T00:00:00.000Z'),
      nikLast4: '3271',
      nikIndex: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    mockRepository = {
      listByStatus: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(buildProspective()),
      findPatientSummary: jest.fn(),
      findMatchCandidates: jest.fn().mockResolvedValue([]),
      linkToPatient: jest.fn().mockResolvedValue({ movedAppointments: 1 }),
    };
    mockPatientService = { createPatientFromProspective: jest.fn() };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    identifierCrypto = {
      computeBlindIndex: jest.fn((value: string) => `index:${value}`),
    } as unknown as NationalIdentifierCryptoService;
    prospectiveArrivalService = new ProspectiveArrivalService(
      mockRepository as unknown as ProspectiveArrivalRepository,
      mockPatientService as unknown as PatientManagementService,
      identifierCrypto,
      mockAuditService as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listMatchCandidates', () => {
    it('seeds the search from the record’s own normalised phone number', async () => {
      await prospectiveArrivalService.listMatchCandidates(prospectiveId, { limit: 8 });

      expect(mockRepository.findMatchCandidates).toHaveBeenCalledWith({
        normalisedPhoneNumber: '628123456789',
        limit: 8,
      });
    });

    it('hashes a supplied NIK to its blind index and never passes the plaintext on', async () => {
      await prospectiveArrivalService.listMatchCandidates(prospectiveId, {
        nik: '3271011503910001',
        limit: 8,
      });

      const params = mockRepository.findMatchCandidates.mock.calls[0]?.[0];
      expect(identifierCrypto.computeBlindIndex).toHaveBeenCalledWith('3271011503910001');
      expect(params).toMatchObject({ nikIndex: 'index:3271011503910001' });
      // The repository is handed a hash and no plaintext field to read one out
      // of: the identifier's reach stops at this service.
      expect(params).not.toHaveProperty('nik');
    });

    it('ranks an exact NIK above a record that matches only the phone number', async () => {
      mockRepository.findMatchCandidates.mockResolvedValue([
        buildCandidate({ id: 'phone-match', fullName: 'Budi Santoso' }),
        buildCandidate({
          id: 'nik-match',
          fullName: 'Someone Else',
          phoneNumber: '628999999999',
          nikIndex: 'index:3271011503910001',
        }),
      ]);

      const actual = await prospectiveArrivalService.listMatchCandidates(prospectiveId, {
        nik: '3271011503910001',
        limit: 8,
      });

      expect(actual.map((candidate) => candidate.id)).toEqual(['nik-match', 'phone-match']);
      expect(actual[0]?.reasons).toEqual(['NIK_EXACT']);
      expect(actual[1]?.reasons).toEqual(['PHONE_EXACT']);
    });

    it('normalises the registry side of the phone comparison', async () => {
      // The stored column holds whatever the front desk typed years ago; the
      // prospective record holds `62…`. Comparing them raw would miss the
      // returning patient this whole flow exists to find.
      mockRepository.findMatchCandidates.mockResolvedValue([
        buildCandidate({ phoneNumber: '+62 812-3456-789' }),
      ]);

      const actual = await prospectiveArrivalService.listMatchCandidates(prospectiveId, {
        limit: 8,
      });

      expect(actual[0]?.reasons).toContain('PHONE_EXACT');
    });

    it('returns only the last four digits of a stored NIK', async () => {
      mockRepository.findMatchCandidates.mockResolvedValue([buildCandidate()]);

      const actual = await prospectiveArrivalService.listMatchCandidates(prospectiveId, {
        limit: 8,
      });

      expect(actual[0]?.nikMasked).toBe('••••••••3271');
    });

    it('claims no reason for a record that matches the typed text and nothing else', async () => {
      mockRepository.findMatchCandidates.mockResolvedValue([
        buildCandidate({ fullName: 'Budi Santoso', phoneNumber: '628999999999' }),
      ]);

      const actual = await prospectiveArrivalService.listMatchCandidates(prospectiveId, {
        search: 'RM-000119',
        limit: 8,
      });

      expect(actual[0]?.reasons).toEqual([]);
      expect(actual[0]?.score).toBe(0);
    });

    it('rejects an unknown prospective record', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        prospectiveArrivalService.listMatchCandidates(prospectiveId, { limit: 8 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('linkToExistingPatient', () => {
    it('repoints the booking without allocating an MRN', async () => {
      mockRepository.findPatientSummary.mockResolvedValue({
        id: 'patient-1',
        mrn: 'RM-000119',
        fullName: 'Siti Rahayu Wulandari',
        isActive: true,
      });

      const actual = await prospectiveArrivalService.linkToExistingPatient(
        prospectiveId,
        { patientId: 'patient-1' },
        actor,
      );

      expect(mockPatientService.createPatientFromProspective).not.toHaveBeenCalled();
      expect(actual).toEqual({
        prospectivePatientId: prospectiveId,
        resolution: 'LINKED',
        patientId: 'patient-1',
        mrn: 'RM-000119',
        patientFullName: 'Siti Rahayu Wulandari',
        movedAppointments: 1,
      });
    });

    it('audits an UPDATE naming the prospective record', async () => {
      mockRepository.findPatientSummary.mockResolvedValue({
        id: 'patient-1',
        mrn: 'RM-000119',
        fullName: 'Siti Rahayu Wulandari',
        isActive: true,
      });

      await prospectiveArrivalService.linkToExistingPatient(
        prospectiveId,
        { patientId: 'patient-1' },
        actor,
      );

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resource: 'ProspectivePatient',
          resourceId: prospectiveId,
          patientId: 'patient-1',
          actorUserId: 'front-desk-user-1',
        }),
      );
    });

    it('refuses a record that has already been resolved', async () => {
      mockRepository.findById.mockResolvedValue(buildProspective({ status: 'CONVERTED' }));

      await expect(
        prospectiveArrivalService.linkToExistingPatient(
          prospectiveId,
          { patientId: 'patient-1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.linkToPatient).not.toHaveBeenCalled();
    });

    it('refuses a deactivated target record', async () => {
      mockRepository.findPatientSummary.mockResolvedValue({
        id: 'patient-1',
        mrn: 'RM-000119',
        fullName: 'Siti Rahayu Wulandari',
        isActive: false,
      });

      await expect(
        prospectiveArrivalService.linkToExistingPatient(
          prospectiveId,
          { patientId: 'patient-1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.linkToPatient).not.toHaveBeenCalled();
    });

    it('refuses an unknown target record', async () => {
      mockRepository.findPatientSummary.mockResolvedValue(null);

      await expect(
        prospectiveArrivalService.linkToExistingPatient(
          prospectiveId,
          { patientId: 'patient-1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('convertToNewPatient', () => {
    const createPayload = {
      fullName: 'Siti Rahayu',
      dateOfBirth: '1991-03-14',
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '08123456789',
      address: 'Jl. Kenanga No. 3',
      isActive: true,
      privacyNotice: {
        privacyNoticeVersionId: '11111111-2222-4333-8444-555555555555',
        locale: 'id',
        outcome: 'ACKNOWLEDGED',
        subjectType: 'SELF',
        provenance: 'FRONT_DESK',
      },
    } as unknown as Parameters<ProspectiveArrivalService['convertToNewPatient']>[1];

    beforeEach(() => {
      mockPatientService.createPatientFromProspective.mockResolvedValue({
        patient: { id: 'patient-new', mrn: 'RM-000483', fullName: 'Siti Rahayu' },
        movedAppointments: 1,
        identifierWarnings: [],
      } as unknown as Awaited<ReturnType<PatientManagementService['createPatientFromProspective']>>);
    });

    it('delegates the create so the registry keeps one write path', async () => {
      const actual = await prospectiveArrivalService.convertToNewPatient(
        prospectiveId,
        createPayload,
        actor,
      );

      expect(mockPatientService.createPatientFromProspective).toHaveBeenCalledWith(
        createPayload,
        prospectiveId,
        actor,
      );
      expect(actual).toMatchObject({
        resolution: 'CONVERTED',
        patientId: 'patient-new',
        mrn: 'RM-000483',
        movedAppointments: 1,
      });
    });

    it('audits a CREATE naming the prospective record and the MRN it spent', async () => {
      await prospectiveArrivalService.convertToNewPatient(prospectiveId, createPayload, actor);

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          resource: 'ProspectivePatient',
          resourceId: prospectiveId,
          patientId: 'patient-new',
          metadata: expect.objectContaining({ resolution: 'CONVERTED', mrn: 'RM-000483' }),
        }),
      );
    });

    it('refuses to spend a second MRN on a record that already converted', async () => {
      mockRepository.findById.mockResolvedValue(buildProspective({ status: 'CONVERTED' }));

      await expect(
        prospectiveArrivalService.convertToNewPatient(prospectiveId, createPayload, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPatientService.createPatientFromProspective).not.toHaveBeenCalled();
    });

    it('refuses an expired record', async () => {
      mockRepository.findById.mockResolvedValue(buildProspective({ status: 'EXPIRED' }));

      await expect(
        prospectiveArrivalService.convertToNewPatient(prospectiveId, createPayload, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
