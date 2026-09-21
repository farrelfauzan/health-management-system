import { PostnatalVisitRecord } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { PostnatalVisitRepository } from '../repository/postnatal-visit.repository';
import { PostnatalVisitService } from './postnatal-visit.service';

const ENCOUNTER_ID = 'encounter-1';
const PREGNANCY_EPISODE_ID = 'pregnancy-1';
const MOTHER_ID = 'mother-1';
/** 1 October 03:00 WIB — the ticket's acceptance birth. */
const BIRTH_AT = new Date('2026-10-01T03:00:00+07:00');
/** 5 October, inside KF2 (4–8 October). */
const VISIT_STARTED_AT = new Date('2026-10-05T09:00:00+07:00');
const CURRENT_USER = { sub: 'user-1' } as CurrentUser;

function buildEncounter(overrides: Record<string, unknown> = {}) {
  return {
    id: ENCOUNTER_ID,
    patientId: MOTHER_ID,
    status: 'IN_PROGRESS',
    startedAt: VISIT_STARTED_AT,
    patient: { ownerUserId: null },
    doctor: { ownerUserId: 'user-1' },
    ...overrides,
  };
}

function buildVisit(overrides: Partial<PostnatalVisitRecord> = {}): PostnatalVisitRecord {
  return {
    id: 'visit-1',
    encounterId: ENCOUNTER_ID,
    subject: 'MOTHER',
    pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
    newbornCareRecordId: null,
    visitCode: 'KF2',
    encounterStartedAt: VISIT_STARTED_AT,
    encounterStatus: 'IN_PROGRESS',
    ...overrides,
  };
}

describe('PostnatalVisitService', () => {
  const repositoryMock = {
    findLatestBirthForMother: jest.fn(),
    findBirthByPregnancyEpisodeId: jest.fn(),
    findNewborn: jest.fn(),
    hasAntenatalVisit: jest.fn(),
    hasMedication: jest.fn(),
    findVisitByEncounterId: jest.fn(),
    listVisitsByPregnancyEpisodeId: jest.fn(),
    createVisit: jest.fn(),
    saveVisitCode: jest.fn(),
    findExamination: jest.fn(),
    upsertExamination: jest.fn(),
  };
  const accessMock = {
    resolveScopeOrThrow: jest.fn(),
    findEncounterForAccess: jest.fn(),
    assertCanReadEncounter: jest.fn(),
    assertCanWriteEncounter: jest.fn(),
    assertEncounterOpen: jest.fn(),
    findActiveAssignmentForCaller: jest.fn(),
  };
  let service: PostnatalVisitService;
  let birthAt: Date;

  beforeEach(() => {
    jest.resetAllMocks();
    birthAt = BIRTH_AT;
    accessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: true, hasOwn: false });
    accessMock.findEncounterForAccess.mockResolvedValue(buildEncounter());
    repositoryMock.hasAntenatalVisit.mockResolvedValue(false);
    repositoryMock.findExamination.mockResolvedValue(null);
    repositoryMock.findBirthByPregnancyEpisodeId.mockImplementation(async () => ({
      pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
      patientId: MOTHER_ID,
      birthAt,
    }));
    service = new PostnatalVisitService(
      repositoryMock as unknown as PostnatalVisitRepository,
      {} as MaternalCareRepository,
      accessMock as unknown as EncounterAccessService,
      { get: jest.fn(() => 'Asia/Jakarta') } as unknown as ConfigService,
    );
  });

  describe('linking a visit', () => {
    it("links a mother's visit on 5 October as KF2", async () => {
      repositoryMock.findVisitByEncounterId.mockResolvedValue(null);
      repositoryMock.findLatestBirthForMother.mockResolvedValue({
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        patientId: MOTHER_ID,
        birthAt: BIRTH_AT,
      });
      repositoryMock.createVisit.mockImplementation(async (payload) => buildVisit(payload));

      const actualVisit = await service.linkVisit(ENCOUNTER_ID, { subject: 'MOTHER' }, CURRENT_USER);

      expect(repositoryMock.createVisit).toHaveBeenCalledWith({
        encounterId: ENCOUNTER_ID,
        subject: 'MOTHER',
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        newbornCareRecordId: null,
        visitCode: 'KF2',
      });
      expect(actualVisit.visitCode).toBe('KF2');
      expect(actualVisit.isCodeFrozen).toBe(false);
    });

    it('refuses a neonatal visit on an encounter that is not the baby’s own', async () => {
      repositoryMock.findVisitByEncounterId.mockResolvedValue(null);
      repositoryMock.findNewborn.mockResolvedValue({
        newbornCareRecordId: 'newborn-1',
        newbornPatientId: 'baby-1',
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        birthAt: BIRTH_AT,
      });

      await expect(
        service.linkVisit(
          ENCOUNTER_ID,
          { subject: 'NEWBORN', newbornCareRecordId: 'newborn-1' },
          CURRENT_USER,
        ),
      ).rejects.toMatchObject({ response: { code: 'POSTNATAL_NEWBORN_NOT_FOUND' } });
    });

    it('refuses an encounter already counted as an antenatal visit', async () => {
      repositoryMock.findVisitByEncounterId.mockResolvedValue(null);
      repositoryMock.hasAntenatalVisit.mockResolvedValue(true);

      await expect(
        service.linkVisit(ENCOUNTER_ID, { subject: 'MOTHER' }, CURRENT_USER),
      ).rejects.toMatchObject({ response: { code: 'ENCOUNTER_IS_ANTENATAL_VISIT' } });
    });
  });

  describe('the code, open and closed', () => {
    it('moves with a corrected birth time while the encounter is open', async () => {
      repositoryMock.findVisitByEncounterId.mockResolvedValue(buildVisit());
      // The birth corrected to 25 September: 5 October is then day 10 — KF3.
      birthAt = new Date('2026-09-25T03:00:00+07:00');

      const actualVisit = await service.getEncounterVisit(ENCOUNTER_ID, CURRENT_USER);

      expect(actualVisit?.visitCode).toBe('KF3');
    });

    it('is frozen at close and does not move with a later correction', async () => {
      repositoryMock.findVisitByEncounterId.mockResolvedValue(buildVisit());
      await service.freezeVisitCodeOnEncounterClose(ENCOUNTER_ID);
      expect(repositoryMock.saveVisitCode).toHaveBeenCalledWith({
        encounterId: ENCOUNTER_ID,
        visitCode: 'KF2',
      });
      repositoryMock.findVisitByEncounterId.mockResolvedValue(
        buildVisit({ visitCode: 'KF2', encounterStatus: 'FINISHED' }),
      );
      birthAt = new Date('2026-09-25T03:00:00+07:00');

      const actualVisit = await service.getEncounterVisit(ENCOUNTER_ID, CURRENT_USER);

      expect(actualVisit?.visitCode).toBe('KF2');
      expect(actualVisit?.isCodeFrozen).toBe(true);
    });
  });

  it('refuses the nifas examination on a neonatal visit', async () => {
    repositoryMock.findVisitByEncounterId.mockResolvedValue(
      buildVisit({ subject: 'NEWBORN', newbornCareRecordId: 'newborn-1', visitCode: 'KN2' }),
    );

    await expect(
      service.upsertExamination(ENCOUNTER_ID, { urination: true }, CURRENT_USER),
    ).rejects.toMatchObject({ response: { code: 'POSTNATAL_EXAMINATION_MOTHER_ONLY' } });
  });
});
