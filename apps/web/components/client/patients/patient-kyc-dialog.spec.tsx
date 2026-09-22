import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PatientKycDialog } from './patient-kyc-dialog';
import messages from '../../../messages/id/clinical.json';

const VALIDATION_URL = 'https://kyc.example/validate?token=abc';

function renderDialog(url: string | null, onClose: () => void = vi.fn()): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <PatientKycDialog url={url} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

describe('PatientKycDialog (P24-T16)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders nothing while no session is open', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('frames the validation URL and always offers a new tab', async () => {
    renderDialog(VALIDATION_URL);

    const frame = screen.getByTestId('patient-kyc-frame');
    expect(frame).toHaveAttribute('src', VALIDATION_URL);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Buka di tab baru/ }));

    expect(window.open).toHaveBeenCalledWith(VALIDATION_URL, '_blank', 'noopener,noreferrer');
  });

  it('falls back to the new-tab notice when the frame has not loaded in time', () => {
    vi.useFakeTimers();
    renderDialog(VALIDATION_URL);

    expect(screen.queryByText(/tidak dapat ditampilkan di sini/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect(screen.getByText(/tidak dapat ditampilkan di sini/)).toBeInTheDocument();
  });

  it('closes on Escape and reports it to the parent', async () => {
    const onClose = vi.fn();
    renderDialog(VALIDATION_URL, onClose);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
