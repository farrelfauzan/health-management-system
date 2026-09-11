import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LocalizedMonthPicker } from './localized-month-picker';
import enMessages from '../../../messages/en/shared.json';
import idMessages from '../../../messages/id/shared.json';

function renderMonthPicker(locale: 'en' | 'id', value: string) {
  const onValueChange = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : idMessages}>
      <LocalizedMonthPicker
        aria-label="Reconciliation month"
        value={value}
        onValueChange={onValueChange}
      />
    </NextIntlClientProvider>,
  );
  return { onValueChange };
}

describe('LocalizedMonthPicker', () => {
  it('names the month in the UI language', () => {
    renderMonthPicker('id', '2026-10');

    expect(screen.getByRole('button', { name: 'Reconciliation month' })).toHaveTextContent(
      'Oktober 2026',
    );
  });

  it('marks the selected month, steps the year, and hands back yyyy-MM', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderMonthPicker('en', '2026-09');

    await user.click(screen.getByRole('button', { name: 'Reconciliation month' }));
    expect(screen.getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Next year' }));
    await user.click(screen.getByRole('button', { name: 'Mar' }));

    expect(onValueChange).toHaveBeenCalledWith('2027-03');
  });
});
