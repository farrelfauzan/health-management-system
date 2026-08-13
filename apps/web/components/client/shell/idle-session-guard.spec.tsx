import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdleSessionGuard } from './idle-session-guard';
import { endSession } from '#lib/auth/end-session';
import { authControllerRecordSessionActivityV1 } from '#lib/api/generated/auth/auth';
import messages from '../../../messages/id/auth-shell.json';

vi.mock('#lib/auth/end-session', () => ({
  endSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('#lib/api/generated/auth/auth', () => ({
  authControllerRecordSessionActivityV1: vi.fn().mockResolvedValue({ status: 200, data: {} }),
}));

const endSessionMock = vi.mocked(endSession);
const heartbeatMock = vi.mocked(authControllerRecordSessionActivityV1);

const IDLE_TIMEOUT_SECONDS = 900;
const WARNING_LEAD_SECONDS = 60;

function renderGuard(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <IdleSessionGuard
          idleTimeoutSeconds={IDLE_TIMEOUT_SECONDS}
          warningLeadSeconds={WARNING_LEAD_SECONDS}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * Advances both the fake clock and the interval that reads it.
 *
 * Everything here is synchronous afterwards, so the assertions use `getBy`
 * rather than `findBy`: testing-library's async queries poll on real timers,
 * which deadlocks against `vi.useFakeTimers` — the poll waits for a clock only
 * this helper can move.
 */
async function advanceSeconds(seconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1_000);
  });
}

describe('IdleSessionGuard (SJ-9)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stays out of the way while the session is fresh', async () => {
    renderGuard();

    await advanceSeconds(60);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  /** SJ-9 acceptance: the modal appears at threshold − 60 s. */
  it('warns once the deadline is inside the warning lead', async () => {
    renderGuard();

    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Masih di sana?')).toBeInTheDocument();
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  /** SJ-9 acceptance: auto-logout at the threshold. */
  it('ends the session when the countdown runs out', async () => {
    renderGuard();

    await advanceSeconds(IDLE_TIMEOUT_SECONDS);

    expect(endSessionMock).toHaveBeenCalledWith('IDLE', expect.anything());
  });

  it('ends the session exactly once, however many ticks pile up', async () => {
    renderGuard();

    await advanceSeconds(IDLE_TIMEOUT_SECONDS + 30);

    expect(endSessionMock).toHaveBeenCalledTimes(1);
  });

  it('dismisses the warning and extends the session when the user answers', async () => {
    renderGuard();
    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Tetap masuk' }).click();
    });
    await advanceSeconds(1);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(heartbeatMock).toHaveBeenCalled();
    // And the full window is back, rather than the minute that was left.
    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS - 1);
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  it('hands the workstation over immediately when asked', async () => {
    renderGuard();
    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Serahkan sekarang' }).click();
    });

    expect(endSessionMock).toHaveBeenCalledWith('IDLE', expect.anything());
  });

  it('resets the countdown on real interaction', async () => {
    renderGuard();
    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS - 10);

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    await advanceSeconds(IDLE_TIMEOUT_SECONDS - WARNING_LEAD_SECONDS - 10);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(endSessionMock).not.toHaveBeenCalled();
  });

  /**
   * A database write per keystroke would be absurd. Activity is continuous;
   * telling the server so is throttled to once every couple of minutes.
   */
  it('throttles heartbeats rather than sending one per event', async () => {
    renderGuard();

    for (let index = 0; index < 20; index += 1) {
      await act(async () => {
        window.dispatchEvent(new Event('pointerdown'));
      });
      await advanceSeconds(1);
    }

    expect(heartbeatMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
