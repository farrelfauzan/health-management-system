import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LocalizedTimePicker } from './localized-time-picker';
import enMessages from '../../../messages/en/shared.json';
import idMessages from '../../../messages/id/shared.json';

type HarnessProps = { initialValue?: string; onValueChange?: (value: string) => void };

function TimeHarness({ initialValue = '', onValueChange }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <LocalizedTimePicker
      aria-label="Start time"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

function renderTimePicker(locale: 'en' | 'id', props: HarnessProps = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : idMessages}>
      <TimeHarness {...props} />
    </NextIntlClientProvider>,
  );
}

describe('LocalizedTimePicker', () => {
  it('shows the translated placeholder until a time is chosen', () => {
    renderTimePicker('id');

    expect(screen.getByRole('button', { name: 'Start time' })).toHaveTextContent('Pilih waktu');
  });

  it('builds HH:mm from an hour then a minute, and closes on the minute', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderTimePicker('en', { onValueChange });

    await user.click(screen.getByRole('button', { name: 'Start time' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '09' }),
    );
    await user.click(
      within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: '30' }),
    );

    expect(onValueChange.mock.calls).toEqual([['09:00'], ['09:30']]);
    expect(screen.getByRole('button', { name: 'Start time' })).toHaveTextContent('09:30');
    expect(screen.queryByRole('listbox', { name: 'Hour' })).not.toBeInTheDocument();
  });

  it('reads an API value that carries seconds', () => {
    renderTimePicker('en', { initialValue: '08:15:00' });

    expect(screen.getByRole('button', { name: 'Start time' })).toHaveTextContent('08:15');
  });
});
