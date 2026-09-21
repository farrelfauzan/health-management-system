import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { FamilyPlanningCourseConflictError } from '../repository/family-planning-course-conflict.error';
import { FamilyPlanningRepository } from '../repository/family-planning.repository';
import { FamilyPlanningAuthorityService } from './family-planning-authority.service';
import { FamilyPlanningService } from './family-planning.service';

/**
 * P25-T14. The course lifecycle rules: the sourced default lands on the row,
 * a second live course is a 409, a refused IUD never reaches the database,
 * and a discontinued course takes nothing more.
 */
describe('FamilyPlanningService (P25-T14)', () => {
  const PATIENT_ID = '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4';
  const MIDWIFE_ID = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const currentUser = { sub: 'user-1' } as CurrentUser;
  const repositoryMock = {
    findPatient: jest.fn(),
    findEncounterLink: jest.fn(),
    findDeliveryLink: jest.fn(),
    createCourse: jest.fn(),
    findCourseById: jest.fn(),
    createService: jest.fn(),
    discontinueCourse: jest.fn(),
    listCoursesByPatientId: jest.fn(),
    findPostDeliveryCandidate: jest.fn(),
    listDue: jest.fn(),
  };
  const resolveMethodMandateMock = jest.fn();
  const encounterAccessMock = {
    resolveScopeOrThrow: jest.fn(),
    findActiveAssignmentForCaller: jest.fn(),
  };
  const auditRecordMock = jest.fn();
  const service = new FamilyPlanningService(
    repositoryMock as unknown as FamilyPlanningRepository,
    { resolveMethodMandate: resolveMethodMandateMock } as unknown as FamilyPlanningAuthorityService,
    encounterAccessMock as unknown as EncounterAccessService,
    { record: auditRecordMock } as unknown as AuditService,
    { get: () => 'Asia/Jakarta' } as unknown as ConfigService,
  );

  function buildStoredCourse(overrides: Record<string, unknown> = {}) {
    return {
      id: 'course-1',
      patientId: PATIENT_ID,
      method: 'INJECTABLE_3_MONTH',
      acceptorType: 'NEW',
      startedOn: new Date('2026-10-01T00:00:00.000Z'),
      providerDoctorId: MIDWIFE_ID,
      providerDoctor: { fullName: 'Bidan Sari' },
      startEncounterId: null,
      deliveryRecordId: null,
      mandateId: null,
      nextDueOn: new Date('2026-12-24T00:00:00.000Z'),
      sideEffects: null,
      discontinuedOn: null,
      discontinuationReason: null,
      services: [],
      ...overrides,
    };
  }

  function buildStartPayload(overrides: Record<string, unknown> = {}) {
    return {
      method: 'INJECTABLE_3_MONTH' as const,
      acceptorType: 'NEW' as const,
      startedOn: '2026-10-01',
      providerDoctorId: MIDWIFE_ID,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    encounterAccessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: true, hasOwn: false });
    repositoryMock.findPatient.mockResolvedValue({ id: PATIENT_ID, ownerUserId: null });
    resolveMethodMandateMock.mockResolvedValue(null);
  });

  describe('startCourse', () => {
    it("stores Ibu Dewi's 3-month injectable with the sourced 84-day due date", async () => {
      repositoryMock.createCourse.mockResolvedValue(buildStoredCourse());
      const actual = await service.startCourse(PATIENT_ID, buildStartPayload(), currentUser);
      expect(repositoryMock.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'INJECTABLE_3_MONTH',
          acceptorType: 'NEW',
          nextDueOn: new Date('2026-12-24T00:00:00.000Z'),
          mandateId: null,
        }),
      );
      expect(actual.nextDueOn).toBe('2026-12-24');
      expect(auditRecordMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FAMILY_PLANNING_STARTED', resourceId: 'course-1' }),
      );
    });

    it('stores a condom with no due date', async () => {
      repositoryMock.createCourse.mockResolvedValue(buildStoredCourse({ method: 'CONDOM' }));
      await service.startCourse(
        PATIENT_ID,
        buildStartPayload({ method: 'CONDOM', nextDueOn: '2026-11-01' }),
        currentUser,
      );
      expect(repositoryMock.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({ nextDueOn: null }),
      );
    });

    it('answers a second live course with 409 FAMILY_PLANNING_COURSE_ACTIVE', async () => {
      repositoryMock.createCourse.mockRejectedValue(new FamilyPlanningCourseConflictError());
      const actualError = await service
        .startCourse(PATIENT_ID, buildStartPayload(), currentUser)
        .catch((err) => err);
      expect(actualError).toBeInstanceOf(ConflictException);
      expect((actualError as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ code: 'FAMILY_PLANNING_COURSE_ACTIVE' }),
      );
      expect(auditRecordMock).not.toHaveBeenCalled();
    });

    it('never writes an IUD the midwife was refused', async () => {
      resolveMethodMandateMock.mockRejectedValue(
        new UnprocessableEntityException({ code: 'MIDWIFE_AUTHORITY_REQUIRED' }),
      );
      await expect(
        service.startCourse(
          PATIENT_ID,
          buildStartPayload({ method: 'IUD', nextDueOn: '2026-11-01' }),
          currentUser,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repositoryMock.createCourse).not.toHaveBeenCalled();
    });

    it('saves an IUD a midwife holds the authority for', async () => {
      repositoryMock.createCourse.mockResolvedValue(buildStoredCourse({ method: 'IUD' }));
      await service.startCourse(
        PATIENT_ID,
        buildStartPayload({ method: 'IUD', nextDueOn: '2026-11-01' }),
        currentUser,
      );
      expect(resolveMethodMandateMock).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'IUD', providerDoctorId: MIDWIFE_ID }),
      );
      expect(repositoryMock.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'IUD', nextDueOn: new Date('2026-11-01T00:00:00.000Z') }),
      );
    });

    it('refuses a delivery that belongs to another patient', async () => {
      repositoryMock.findDeliveryLink.mockResolvedValue({ id: 'delivery-1', patientId: 'other' });
      const actualError = await service
        .startCourse(PATIENT_ID, buildStartPayload({ deliveryRecordId: 'delivery-1' }), currentUser)
        .catch((err) => err);
      expect((actualError as UnprocessableEntityException).getResponse()).toEqual(
        expect.objectContaining({ code: 'FAMILY_PLANNING_LINK_PATIENT_MISMATCH' }),
      );
    });
  });

  describe('recordService', () => {
    it('moves the due date to the default from the service day', async () => {
      repositoryMock.findCourseById.mockResolvedValue(buildStoredCourse());
      repositoryMock.createService.mockResolvedValue(buildStoredCourse());
      await service.recordService(
        'course-1',
        { servedOn: '2026-12-23', action: 'Suntik ulang' },
        currentUser,
      );
      expect(repositoryMock.createService).toHaveBeenCalledWith(
        expect.objectContaining({ nextDueOn: new Date('2027-03-17T00:00:00.000Z') }),
      );
    });

    it('refuses a discontinued course with 409', async () => {
      repositoryMock.findCourseById.mockResolvedValue(
        buildStoredCourse({ discontinuedOn: new Date('2026-11-01T00:00:00.000Z') }),
      );
      const actualError = await service
        .recordService('course-1', { servedOn: '2026-12-23', action: 'Suntik ulang' }, currentUser)
        .catch((err) => err);
      expect((actualError as ConflictException).getResponse()).toEqual(
        expect.objectContaining({ code: 'FAMILY_PLANNING_COURSE_DISCONTINUED' }),
      );
    });
  });

  describe('discontinueCourse', () => {
    it('audits the discontinuation with its reason', async () => {
      repositoryMock.findCourseById.mockResolvedValue(buildStoredCourse());
      repositoryMock.discontinueCourse.mockResolvedValue(
        buildStoredCourse({
          discontinuedOn: new Date('2026-12-01T00:00:00.000Z'),
          discontinuationReason: 'SIDE_EFFECT',
        }),
      );
      const actual = await service.discontinueCourse(
        'course-1',
        { discontinuedOn: '2026-12-01', reason: 'SIDE_EFFECT' },
        currentUser,
      );
      expect(actual.isLive).toBe(false);
      expect(auditRecordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FAMILY_PLANNING_DISCONTINUED',
          metadata: expect.objectContaining({ reason: 'SIDE_EFFECT' }),
        }),
      );
    });

    it('refuses a discontinuation dated before the start', async () => {
      repositoryMock.findCourseById.mockResolvedValue(buildStoredCourse());
      const actualError = await service
        .discontinueCourse('course-1', { discontinuedOn: '2026-09-01', reason: 'OTHER' }, currentUser)
        .catch((err) => err);
      expect((actualError as UnprocessableEntityException).getResponse()).toEqual(
        expect.objectContaining({ code: 'FAMILY_PLANNING_DATE_BEFORE_START' }),
      );
    });
  });

  describe('listDue', () => {
    it('counts days until due against the clinic day, negative when overdue', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-12-17T03:00:00.000Z'));
      repositoryMock.listDue.mockResolvedValue([
        {
          id: 'course-1',
          patientId: PATIENT_ID,
          method: 'INJECTABLE_3_MONTH',
          nextDueOn: new Date('2026-12-24T00:00:00.000Z'),
          patient: { fullName: 'Dewi Lestari', mrn: 'RM-1' },
        },
        {
          id: 'course-2',
          patientId: 'patient-2',
          method: 'PILL',
          nextDueOn: new Date('2026-12-10T00:00:00.000Z'),
          patient: { fullName: 'Rina', mrn: 'RM-2' },
        },
      ]);
      const actual = await service.listDue({ withinDays: 7 }, currentUser);
      jest.useRealTimers();
      expect(repositoryMock.listDue).toHaveBeenCalledWith({
        dueOnOrBefore: new Date('2026-12-24T00:00:00.000Z'),
        scope: { hasAny: true },
      });
      expect(actual.map((item) => item.daysUntilDue)).toEqual([7, -7]);
    });
  });
});
