import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { RefreshCountdown } from './refresh-countdown';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

function renderCountdown() {
  return render(
    <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
      <RefreshCountdown dataUpdatedAt={Date.now()} intervalMs={300000} />
    </NextIntlClientProvider>,
  );
}

describe('RefreshCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full interval right after a refresh', () => {
    renderCountdown();

    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText(/pembaruan otomatis berikutnya dalam/i)).toBeInTheDocument();
  });

  it('ticks the remaining time down every second', () => {
    renderCountdown();

    act(() => {
      vi.advanceTimersByTime(65000);
    });

    expect(screen.getByText('03:55')).toBeInTheDocument();
  });

  it('clamps at zero once the interval has elapsed', () => {
    renderCountdown();

    act(() => {
      vi.advanceTimersByTime(400000);
    });

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });
});
