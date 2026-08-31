import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OverdueProspectivePatientRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { ProspectivePatientRepository } from '../repository/prospective-patient.repository';
import {
  canPurgeOverdueRecord,
  ProspectivePatientExpiryWorker,
} from './prospective-patient-expiry.worker';

function buildConfigService(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function buildOverdue(
  overrides: Partial<OverdueProspectivePatientRecord> = {},
): OverdueProspectivePatientRecord {
  return {
    id: 'prospective-1',
    liveAppointments: 0,
    staleAppointments: 0,
    ...overrides,
  };
}

describe('canPurgeOverdueRecord', () => {
  it('allows a record nobody is still expecting', () => {
    expect(canPurgeOverdueRecord(buildOverdue())).toBe(true);
  });

  it('refuses a record with a live booking', () => {
    // Booked four months ahead, or rescheduled twice. Past the retention date
    // and still has not arrived *yet* — deleting them drops the subject of a
    // booking the front desk is expecting to see walk in.
    expect(canPurgeOverdueRecord(buildOverdue({ liveAppointments: 1 }))).toBe(false);
  });

  it('allows a record whose only bookings are cancelled', () => {
    expect(canPurgeOverdueRecord(buildOverdue({ staleAppointments: 2 }))).toBe(true);
  });
});

describe('ProspectivePatientExpiryWorker', () => {
  const repositoryMock = {
    findOverdueRecords: jest.fn(),
    purgeOverdueRecord: jest.fn(),
  };
  const auditServiceMock = {
    record: jest.fn(),
  };

  function buildWorker(values: Record<string, string> = {}): ProspectivePatientExpiryWorker {
    return new ProspectivePatientExpiryWorker(
      buildConfigService(values),
      repositoryMock as unknown as ProspectivePatientRepository,
      auditServiceMock as unknown as AuditService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    repositoryMock.findOverdueRecords.mockResolvedValue([]);
    repositoryMock.purgeOverdueRecord.mockResolvedValue(true);
    auditServiceMock.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sweeps once per configured interval', async () => {
      const worker = buildWorker({ CS_PROSPECTIVE_EXPIRY_WORKER_POLL_INTERVAL_MS: '1000' });

      worker.onApplicationBootstrap();
      // The async variant, so each sweep settles before the next tick fires.
      // With the synchronous one the second tick would find `isSweeping` still
      // true and be skipped — correct behaviour, but it would make this test
      // assert the overlap guard rather than the interval.
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(1_000);

      expect(repositoryMock.findOverdueRecords).toHaveBeenCalledTimes(2);
      worker.onApplicationShutdown();
    });

    it('runs by default when no flag is set', () => {
      // Unlike every other worker in this codebase. Not sweeping is the
      // compliance failure the job exists to prevent, so a deployment that
      // never set the variable must sweep rather than silently accumulate.
      const worker = buildWorker({ CS_PROSPECTIVE_EXPIRY_WORKER_POLL_INTERVAL_MS: '1000' });

      worker.onApplicationBootstrap();
      jest.advanceTimersByTime(1_000);

      expect(repositoryMock.findOverdueRecords).toHaveBeenCalled();
      worker.onApplicationShutdown();
    });

    it('does not sweep when the flag is off', () => {
      const worker = buildWorker({
        CS_PROSPECTIVE_EXPIRY_WORKER_ENABLED: 'false',
        CS_PROSPECTIVE_EXPIRY_WORKER_POLL_INTERVAL_MS: '1000',
      });

      worker.onApplicationBootstrap();
      jest.advanceTimersByTime(60_000);

      expect(repositoryMock.findOverdueRecords).not.toHaveBeenCalled();
      worker.onApplicationShutdown();
    });

    it('stops sweeping after shutdown', () => {
      const worker = buildWorker({ CS_PROSPECTIVE_EXPIRY_WORKER_POLL_INTERVAL_MS: '1000' });

      worker.onApplicationBootstrap();
      worker.onApplicationShutdown();
      jest.advanceTimersByTime(60_000);

      expect(repositoryMock.findOverdueRecords).not.toHaveBeenCalled();
    });
  });

  describe('sweepOnce', () => {
    it('asks for records past their date, bounded by the batch limit', async () => {
      const worker = buildWorker({ CS_PROSPECTIVE_EXPIRY_WORKER_BATCH_LIMIT: '25' });

      await worker.sweepOnce();

      expect(repositoryMock.findOverdueRecords).toHaveBeenCalledWith({
        now: expect.any(Date),
        limit: 25,
      });
    });

    it('purges the records nobody is expecting and skips the rest', async () => {
      repositoryMock.findOverdueRecords.mockResolvedValue([
        buildOverdue({ id: 'inert' }),
        buildOverdue({ id: 'still-expected', liveAppointments: 1 }),
        buildOverdue({ id: 'cancelled-only', staleAppointments: 3 }),
      ]);

      const actual = await buildWorker().sweepOnce();

      expect(actual).toEqual({ purged: 2, skipped: 1 });
      expect(repositoryMock.purgeOverdueRecord).toHaveBeenCalledTimes(2);
      expect(repositoryMock.purgeOverdueRecord).not.toHaveBeenCalledWith(
        expect.objectContaining({ prospectivePatientId: 'still-expected' }),
      );
    });

    it('counts a record the repository declined at write time as skipped', async () => {
      // A customer booked, or the counter resolved the record, between the read
      // and the transaction. The repository re-checks and refuses; the sweep
      // must report that rather than claim a deletion that did not happen.
      repositoryMock.findOverdueRecords.mockResolvedValue([buildOverdue()]);
      repositoryMock.purgeOverdueRecord.mockResolvedValue(false);

      const actual = await buildWorker().sweepOnce();

      expect(actual).toEqual({ purged: 0, skipped: 1 });
    });

    it('audits counts and never a record id', async () => {
      repositoryMock.findOverdueRecords.mockResolvedValue([
        buildOverdue({ id: 'inert' }),
        buildOverdue({ id: 'still-expected', liveAppointments: 1 }),
      ]);

      await buildWorker().sweepOnce();

      expect(auditServiceMock.record).toHaveBeenCalledWith({
        action: 'DELETE',
        resource: 'ProspectivePatient',
        metadata: { purged: 1, skipped: 1 },
      });
      // The rows this job deletes are a name and a phone number belonging to
      // somebody who was never a patient. An audit trail naming them would
      // outlive the deletion it describes.
      const audited = JSON.stringify(auditServiceMock.record.mock.calls[0]?.[0]);
      expect(audited).not.toContain('inert');
      expect(audited).not.toContain('still-expected');
    });

    it('writes no audit row when there was nothing to do', async () => {
      await buildWorker().sweepOnce();

      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('survives a repository failure and reports nothing done', async () => {
      repositoryMock.findOverdueRecords.mockRejectedValue(new Error('connection lost'));

      const actual = await buildWorker().sweepOnce();

      expect(actual).toEqual({ purged: 0, skipped: 0 });
    });

    it('skips an overlapping sweep rather than queueing it', async () => {
      let releaseFirstRead: (() => void) | undefined;
      repositoryMock.findOverdueRecords.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRead = () => resolve([]);
          }),
      );
      const worker = buildWorker();

      const firstSweep = worker.sweepOnce();
      const secondSweep = await worker.sweepOnce();
      releaseFirstRead?.();
      await firstSweep;

      expect(secondSweep).toEqual({ purged: 0, skipped: 0 });
      expect(repositoryMock.findOverdueRecords).toHaveBeenCalledTimes(1);
    });
  });
});
