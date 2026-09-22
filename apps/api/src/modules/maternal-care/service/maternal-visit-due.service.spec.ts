import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  FamilyPlanningDueItem,
  MaternalDueRange,
  MaternalDueRecord,
  ShkScreeningView,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { FamilyPlanningService } from './family-planning.service';
import { MaternalCareService } from './maternal-care.service';
import { MaternalVisitDueService } from './maternal-visit-due.service';
import { PostnatalVisitService } from './postnatal-visit.service';
import { ShkScreeningService } from './shk-screening.service';

const RANGE: MaternalDueRange = { from: '2026-10-01', to: '2026-10-07' };
const CURRENT_USER = { sub: 'user-midwife' } as CurrentUser;

function buildRecord(overrides: Partial<MaternalDueRecord>): MaternalDueRecord {
  return {
    visitKey: 'ANC:episode-1:T2',
    source: 'ANTENATAL',
    code: 'T2',
    subject: 'PATIENT',
    patientId: 'patient-1',
    patientName: 'Rina',
    medicalRecordNumber: 'RM-1',
    dueFrom: '2026-10-03',
    dueUntil: '2027-01-10',
    ...overrides,
  };
}

function buildFamilyPlanningItem(overrides: Partial<FamilyPlanningDueItem>): FamilyPlanningDueItem {
  return {
    familyPlanningRecordId: 'kb-1',
    patientId: 'patient-2',
    patientName: 'Ani',
    medicalRecordNumber: 'RM-2',
    method: 'INJECTABLE_3_MONTH',
    nextDueOn: '2026-10-02',
    daysUntilDue: 1,
    ...overrides,
  } as FamilyPlanningDueItem;
}

function buildShkSample(overrides: Partial<ShkScreeningView>): ShkScreeningView {
  return {
    id: 'shk-1',
    sequence: 1,
    dueFrom: '2026-10-04T01:00:00.000Z',
    dueUntil: '2026-10-05T01:00:00.000Z',
    motherPatientId: 'patient-3',
    motherName: 'Budi',
    ...overrides,
  } as ShkScreeningView;
}

describe('MaternalVisitDueService', () => {
  let mockMaternalCareService: jest.Mocked<Pick<MaternalCareService, 'listAntenatalDueRecords'>>;
  let mockPostnatalVisitService: jest.Mocked<
    Pick<PostnatalVisitService, 'listPostnatalDueRecords'>
  >;
  let mockFamilyPlanningService: jest.Mocked<
    Pick<FamilyPlanningService, 'listDueWithinReach' | 'resolveDueReach'>
  >;
  let mockShkScreeningService: jest.Mocked<
    Pick<ShkScreeningService, 'listUntakenSamplesWithinReach'>
  >;
  let service: MaternalVisitDueService;

  beforeEach(() => {
    mockMaternalCareService = { listAntenatalDueRecords: jest.fn().mockResolvedValue([]) };
    mockPostnatalVisitService = { listPostnatalDueRecords: jest.fn().mockResolvedValue([]) };
    mockFamilyPlanningService = {
      listDueWithinReach: jest.fn().mockResolvedValue([]),
      resolveDueReach: jest.fn().mockResolvedValue({ hasAny: true }),
    };
    mockShkScreeningService = { listUntakenSamplesWithinReach: jest.fn().mockResolvedValue([]) };
    service = new MaternalVisitDueService(
      mockMaternalCareService as unknown as MaternalCareService,
      mockPostnatalVisitService as unknown as PostnatalVisitService,
      mockFamilyPlanningService as unknown as FamilyPlanningService,
      mockShkScreeningService as unknown as ShkScreeningService,
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' }),
    );
  });

  it('gathers all four sources into one list, soonest first', async () => {
    mockMaternalCareService.listAntenatalDueRecords.mockResolvedValue([buildRecord({})]);
    mockPostnatalVisitService.listPostnatalDueRecords.mockResolvedValue([
      buildRecord({
        visitKey: 'PNC:episode-9:KF2',
        source: 'POSTNATAL',
        code: 'KF2',
        dueFrom: '2026-10-01',
        dueUntil: '2026-10-05',
      }),
    ]);
    mockFamilyPlanningService.listDueWithinReach.mockResolvedValue([buildFamilyPlanningItem({})]);
    mockShkScreeningService.listUntakenSamplesWithinReach.mockResolvedValue([buildShkSample({})]);

    const actual = await service.listDue(RANGE, CURRENT_USER);

    expect(actual.map((record) => record.visitKey)).toEqual([
      'PNC:episode-9:KF2',
      'KB:kb-1:2026-10-02',
      'ANC:episode-1:T2',
      'SHK:shk-1',
    ]);
  });

  it('asks every source under the one reach resolved for the caller', async () => {
    const expectedReach = {
      hasAny: false as const,
      ownerUserId: 'user-midwife',
      doctorId: 'doctor-1',
    };
    mockFamilyPlanningService.resolveDueReach.mockResolvedValue(expectedReach);

    await service.listDue(RANGE, CURRENT_USER);

    expect(mockMaternalCareService.listAntenatalDueRecords).toHaveBeenCalledWith(
      RANGE,
      expectedReach,
    );
    expect(mockPostnatalVisitService.listPostnatalDueRecords).toHaveBeenCalledWith(
      RANGE,
      expectedReach,
    );
    expect(mockFamilyPlanningService.listDueWithinReach).toHaveBeenCalledWith({
      dueOnOrBefore: RANGE.to,
      reach: expectedReach,
    });
    expect(mockShkScreeningService.listUntakenSamplesWithinReach).toHaveBeenCalledWith(
      expectedReach,
    );
  });

  it('refuses a caller under OWN scope who is not a clinician', async () => {
    mockFamilyPlanningService.resolveDueReach.mockResolvedValue({
      hasAny: false,
      ownerUserId: 'user-patient',
      doctorId: null,
    });

    await expect(service.listDue(RANGE, CURRENT_USER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a KB date before the range out, and keys each due date separately', async () => {
    mockFamilyPlanningService.listDueWithinReach.mockResolvedValue([
      buildFamilyPlanningItem({ familyPlanningRecordId: 'kb-late', nextDueOn: '2026-09-20' }),
      buildFamilyPlanningItem({ familyPlanningRecordId: 'kb-due', nextDueOn: '2026-10-07' }),
    ]);

    const actual = await service.listDueForReminders(RANGE);

    expect(actual).toEqual([
      expect.objectContaining({
        visitKey: 'KB:kb-due:2026-10-07',
        source: 'FAMILY_PLANNING',
        dueFrom: '2026-10-07',
        dueUntil: '2026-10-07',
      }),
    ]);
  });

  it('reports an SHK sample against the mother, on clinic-local dates, only when it touches the range', async () => {
    mockShkScreeningService.listUntakenSamplesWithinReach.mockResolvedValue([
      // 2026-10-06 18:00Z is 2026-10-07 01:00 in Jakarta: inside the range.
      buildShkSample({
        id: 'shk-in',
        dueFrom: '2026-10-06T18:00:00.000Z',
        dueUntil: '2026-10-07T18:00:00.000Z',
      }),
      buildShkSample({
        id: 'shk-out',
        dueFrom: '2026-10-09T01:00:00.000Z',
        dueUntil: '2026-10-10T01:00:00.000Z',
      }),
    ]);

    const actual = await service.listDueForReminders(RANGE);

    expect(actual).toEqual([
      expect.objectContaining({
        visitKey: 'SHK:shk-in',
        subject: 'NEWBORN',
        patientId: 'patient-3',
        dueFrom: '2026-10-07',
        dueUntil: '2026-10-08',
      }),
    ]);
  });

  it('runs the reminder list clinic-wide without resolving a caller', async () => {
    await service.listDueForReminders(RANGE);

    expect(mockFamilyPlanningService.resolveDueReach).not.toHaveBeenCalled();
    expect(mockMaternalCareService.listAntenatalDueRecords).toHaveBeenCalledWith(RANGE, {
      hasAny: true,
    });
  });
});
