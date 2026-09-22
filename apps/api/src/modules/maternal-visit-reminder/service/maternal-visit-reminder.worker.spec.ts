import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MaternalVisitReminderService } from './maternal-visit-reminder.service';
import { MaternalVisitReminderWorker } from './maternal-visit-reminder.worker';

/** 09:05 in Asia/Jakarta (UTC+7). */
const MORNING = new Date('2026-10-01T02:05:00.000Z');
/** 19:00 in Asia/Jakarta. */
const EVENING = new Date('2026-10-01T12:00:00.000Z');

describe('MaternalVisitReminderWorker', () => {
  let mockReminderService: jest.Mocked<Pick<MaternalVisitReminderService, 'sendDueReminders'>>;

  function buildWorker(values: Record<string, string> = {}): MaternalVisitReminderWorker {
    return new MaternalVisitReminderWorker(
      mockReminderService as unknown as MaternalVisitReminderService,
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta', ...values }),
    );
  }

  beforeEach(() => {
    mockReminderService = { sendDueReminders: jest.fn().mockResolvedValue(2) };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is off unless MATERNAL_REMINDERS_ENABLED is "true"', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const worker = buildWorker();

    worker.onApplicationBootstrap();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    worker.onApplicationShutdown();
  });

  it('starts an unref’d interval when enabled', () => {
    const worker = buildWorker({ MATERNAL_REMINDERS_ENABLED: 'true' });
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    worker.onApplicationBootstrap();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    worker.onApplicationShutdown();
  });

  it('sends from 09:00 on the clinic clock', async () => {
    const actual = await buildWorker().sweepOnce(MORNING);

    expect(actual).toBe(2);
    expect(mockReminderService.sendDueReminders).toHaveBeenCalledWith(MORNING);
  });

  it('does nothing in the evening', async () => {
    const actual = await buildWorker().sweepOnce(EVENING);

    expect(actual).toBe(0);
    expect(mockReminderService.sendDueReminders).not.toHaveBeenCalled();
  });

  it('answers 0 rather than throwing when a sweep fails', async () => {
    mockReminderService.sendDueReminders.mockRejectedValue(new Error('db down'));

    await expect(buildWorker().sweepOnce(MORNING)).resolves.toBe(0);
  });

  it('refuses a malformed interval at boot', () => {
    expect(() => buildWorker({ MATERNAL_REMINDERS_SWEEP_INTERVAL_MS: 'soon' })).toThrow(
      /MATERNAL_REMINDERS_SWEEP_INTERVAL_MS/,
    );
  });
});
