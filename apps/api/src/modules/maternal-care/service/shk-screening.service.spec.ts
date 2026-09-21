import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { ShkScreeningRepository } from '../repository/shk-screening.repository';
import { ShkRecallNotificationService } from './shk-recall-notification.service';
import { ShkScreeningService } from './shk-screening.service';

/**
 * P25-T10. What a result does, and who may record one.
 *
 * A RECALL or an INVALID_SAMPLE is not the end of the baby's screening but
 * the start of her next sample, and the clinicians are told once.
 */
describe('ShkScreeningService (P25-T10)', () => {
  const SCREENING_ID = '3f4a5b6c-7d8e-4f9a-8b0c-1d2e3f4a5b6c';
  const currentUser = { sub: 'user-1' } as CurrentUser;

  const repositoryMock = {
    listWorklist: jest.fn(),
    findById: jest.fn(),
    isWithinReach: jest.fn(),
    findActiveDoctorIdByOwnerUserId: jest.fn(),
    recordSample: jest.fn(),
    recordSent: jest.fn(),
    recordResult: jest.fn(),
  };
  const encounterAccessMock = { resolveScopeOrThrow: jest.fn() };
  const notifierMock = { notifyRecall: jest.fn() };
  const auditMock = { record: jest.fn() };

  const service = new ShkScreeningService(
    repositoryMock as unknown as ShkScreeningRepository,
    encounterAccessMock as unknown as EncounterAccessService,
    notifierMock as unknown as ShkRecallNotificationService,
    auditMock as unknown as AuditService,
  );

  function buildStoredScreening(overrides: Record<string, unknown> = {}) {
    return {
      id: SCREENING_ID,
      newbornCareRecordId: 'newborn-1',
      sequence: 1,
      dueFrom: new Date('2026-10-02T20:00:00.000Z'),
      dueUntil: new Date('2026-10-03T20:00:00.000Z'),
      sampleTakenAt: new Date('2026-10-03T01:00:00.000Z'),
      sentAt: null,
      laboratoryName: null,
      resultReceivedAt: null,
      result: null,
      notes: null,
      sampleTakenBy: null,
      newbornCareRecord: {
        id: 'newborn-1',
        sex: 'FEMALE',
        newbornPatientId: null,
        newbornPatient: null,
        deliveryRecord: {
          birthAt: new Date('2026-09-30T20:00:00.000Z'),
          attendantDoctorId: 'doctor-1',
          attendantDoctor: { fullName: 'Bidan Siti', ownerUserId: 'attendant-user' },
          pregnancyEpisode: { patientId: 'mother-1', patient: { fullName: 'Rina' } },
        },
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    encounterAccessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: true, hasOwn: false });
    repositoryMock.findById.mockResolvedValue(buildStoredScreening());
    repositoryMock.recordResult.mockResolvedValue({ nextScreeningId: 'next-1' });
  });

  it('opens sequence 2, due at once, and announces the recall once', async () => {
    const inputReceivedAt = '2026-10-10T02:00:00.000Z';

    await service.recordResult(
      SCREENING_ID,
      { receivedAt: inputReceivedAt, result: 'RECALL', notes: null },
      currentUser,
    );

    expect(repositoryMock.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'RECALL',
        nextSample: {
          sequence: 2,
          dueFrom: new Date(inputReceivedAt),
          dueUntil: new Date('2026-10-11T02:00:00.000Z'),
        },
      }),
    );
    expect(notifierMock.notifyRecall).toHaveBeenCalledTimes(1);
    expect(notifierMock.notifyRecall).toHaveBeenCalledWith({
      attendantUserId: 'attendant-user',
      motherPatientId: 'mother-1',
      motherName: 'Rina',
      sequence: 2,
    });
  });

  it('treats an INVALID_SAMPLE like a recall', async () => {
    await service.recordResult(
      SCREENING_ID,
      { receivedAt: '2026-10-10T02:00:00.000Z', result: 'INVALID_SAMPLE' },
      currentUser,
    );

    expect(repositoryMock.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ nextSample: expect.objectContaining({ sequence: 2 }) }),
    );
    expect(notifierMock.notifyRecall).toHaveBeenCalledTimes(1);
  });

  it('closes the screening on NORMAL with no repeat and no notification', async () => {
    await service.recordResult(
      SCREENING_ID,
      { receivedAt: '2026-10-10T02:00:00.000Z', result: 'NORMAL' },
      currentUser,
    );

    expect(repositoryMock.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ nextSample: null }),
    );
    expect(notifierMock.notifyRecall).not.toHaveBeenCalled();
  });

  it('refuses a result before the heel prick is recorded', async () => {
    repositoryMock.findById.mockResolvedValue(buildStoredScreening({ sampleTakenAt: null }));

    await expect(
      service.recordResult(
        SCREENING_ID,
        { receivedAt: '2026-10-10T02:00:00.000Z', result: 'NORMAL' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repositoryMock.recordResult).not.toHaveBeenCalled();
  });

  it('answers a second result with a conflict and tells nobody', async () => {
    repositoryMock.recordResult.mockResolvedValue(null);

    await expect(
      service.recordResult(
        SCREENING_ID,
        { receivedAt: '2026-10-10T02:00:00.000Z', result: 'RECALL' },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notifierMock.notifyRecall).not.toHaveBeenCalled();
  });

  it('records an overdue heel prick rather than refusing it', async () => {
    repositoryMock.findById.mockResolvedValue(buildStoredScreening({ sampleTakenAt: null }));
    repositoryMock.recordSample.mockResolvedValue(true);

    await service.recordSample(SCREENING_ID, { takenAt: '2026-10-06T08:00:00.000Z' }, currentUser);

    expect(repositoryMock.recordSample).toHaveBeenCalledWith({
      id: SCREENING_ID,
      takenAt: new Date('2026-10-06T08:00:00.000Z'),
      takenById: 'user-1',
    });
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHK_SAMPLE_TAKEN', patientId: 'mother-1' }),
    );
  });

  it('refuses a heel prick dated before the birth', async () => {
    repositoryMock.findById.mockResolvedValue(buildStoredScreening({ sampleTakenAt: null }));

    await expect(
      service.recordSample(SCREENING_ID, { takenAt: '2026-09-30T19:00:00.000Z' }, currentUser),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('refuses an OWN-scope caller with no clinician profile, such as a patient', async () => {
    encounterAccessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: false, hasOwn: true });
    repositoryMock.findActiveDoctorIdByOwnerUserId.mockResolvedValue(null);

    await expect(service.listWorklist({}, currentUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repositoryMock.listWorklist).not.toHaveBeenCalled();
  });

  it('scopes an OWN clinician to her reach', async () => {
    encounterAccessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: false, hasOwn: true });
    repositoryMock.findActiveDoctorIdByOwnerUserId.mockResolvedValue('doctor-9');
    repositoryMock.listWorklist.mockResolvedValue([]);

    await service.listWorklist({ status: 'DUE' }, currentUser);

    expect(repositoryMock.listWorklist).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'DUE', reachDoctorId: 'doctor-9' }),
    );
  });

  it('refuses an OWN clinician a sample outside her reach', async () => {
    encounterAccessMock.resolveScopeOrThrow.mockResolvedValue({ hasAny: false, hasOwn: true });
    repositoryMock.findActiveDoctorIdByOwnerUserId.mockResolvedValue('doctor-9');
    repositoryMock.isWithinReach.mockResolvedValue(false);

    await expect(
      service.recordSample(SCREENING_ID, { takenAt: '2026-10-03T01:00:00.000Z' }, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
