import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RefreshCountdown } from './refresh-countdown';

describe('RefreshCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full interval right after a refresh', () => {
    render(<RefreshCountdown dataUpdatedAt={Date.now()} intervalMs={300000} />);

    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText(/next automatic refresh in/i)).toBeInTheDocument();
  });

  it('ticks the remaining time down every second', () => {
    render(<RefreshCountdown dataUpdatedAt={Date.now()} intervalMs={300000} />);

    act(() => {
      vi.advanceTimersByTime(65000);
    });

    expect(screen.getByText('03:55')).toBeInTheDocument();
  });

  it('clamps at zero once the interval has elapsed', () => {
    render(<RefreshCountdown dataUpdatedAt={Date.now()} intervalMs={300000} />);

    act(() => {
      vi.advanceTimersByTime(400000);
    });

    expect(screen.getByText('00:00')).toBeInTheDocument();
  });
});
