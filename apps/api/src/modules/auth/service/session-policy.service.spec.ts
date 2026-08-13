import { ConfigService } from '@nestjs/config';

import { SessionPolicyService } from './session-policy.service';

function buildPolicy(overrides: Record<string, string> = {}): SessionPolicyService {
  return new SessionPolicyService(new ConfigService({ ...overrides }));
}

describe('SessionPolicyService (SJ-9)', () => {
  it('defaults to the fifteen minutes recorded on the ticket', () => {
    expect(buildPolicy().idleTimeoutMinutes).toBe(15);
  });

  it('honours a configured threshold', () => {
    expect(buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: '10' }).idleTimeoutMinutes).toBe(10);
  });

  /**
   * Below a couple of minutes an idle timeout stops being a control and
   * becomes something staff work around — a key propped on the keyboard, or a
   * request to switch it off entirely. Falling back is safer than honouring a
   * value that guarantees the feature gets disabled.
   */
  it.each(['0', '1', '-5', 'soon', ''])('falls back for the unusable value %p', (inputValue) => {
    expect(buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: inputValue }).idleTimeoutMinutes).toBe(15);
  });

  it('treats a session inside the window as live', () => {
    const policy = buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: '15' });
    const now = new Date('2026-08-13T10:00:00.000Z');

    expect(policy.hasIdledOut(new Date('2026-08-13T09:50:00.000Z'), now)).toBe(false);
  });

  it('treats a session past the window as idled out', () => {
    const policy = buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: '15' });
    const now = new Date('2026-08-13T10:00:00.000Z');

    expect(policy.hasIdledOut(new Date('2026-08-13T09:44:00.000Z'), now)).toBe(true);
  });

  it('does not expire a session exactly on the boundary', () => {
    const policy = buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: '15' });
    const now = new Date('2026-08-13T10:00:00.000Z');

    expect(policy.hasIdledOut(new Date('2026-08-13T09:45:00.000Z'), now)).toBe(false);
  });

  it('warns sixty seconds ahead by default', () => {
    expect(buildPolicy().warningLeadSeconds).toBe(60);
  });

  /**
   * A two-minute window cannot carry a sixty-second warning without the modal
   * occupying half the session. Clamping to a third keeps the warning a
   * warning rather than the normal state of the screen.
   */
  it('clamps the warning so it cannot swallow a short window', () => {
    expect(buildPolicy({ SESSION_IDLE_TIMEOUT_MINUTES: '2' }).warningLeadSeconds).toBe(40);
  });

  it('warns at boot when the access token outlives the idle window', () => {
    const policy = buildPolicy({
      SESSION_IDLE_TIMEOUT_MINUTES: '15',
      JWT_ACCESS_EXPIRES_IN: '15m',
    });
    const warnSpy = jest.spyOn(policy['logger'], 'warn').mockImplementation();

    policy.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('timed out while still in use'));
  });

  it('stays quiet when the ratio is sane', () => {
    const policy = buildPolicy({
      SESSION_IDLE_TIMEOUT_MINUTES: '15',
      JWT_ACCESS_EXPIRES_IN: '5m',
    });
    const warnSpy = jest.spyOn(policy['logger'], 'warn').mockImplementation();

    policy.onApplicationBootstrap();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
