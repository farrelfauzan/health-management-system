import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LocalizedDatePicker } from './localized-date-picker';
import enMessages from '../../../messages/en/shared.json';

const YEARS_SELECTABLE_IN_FUTURE = 20;

function renderDatePicker(props: { value: string; maxValue?: string }) {
  const onValueChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocalizedDatePicker {...props} onValueChange={onValueChange} />
    </NextIntlClientProvider>,
  );
  return { onValueChange };
}

describe('LocalizedDatePicker', () => {
  it('offers years past this one, so an expiry date can be next decade', async () => {
    const user = userEvent.setup();
    const futureYear = String(new Date().getFullYear() + YEARS_SELECTABLE_IN_FUTURE);
    renderDatePicker({ value: '' });

    await user.click(screen.getByRole('button', { name: /Pick a date/ }));

    expect(screen.getByRole('option', { name: futureYear })).toBeInTheDocument();
  });

  it('stops at maxValue, so a date of birth cannot be set in the future', async () => {
    const user = userEvent.setup();
    const currentYear = new Date().getFullYear();
    renderDatePicker({ value: '1990-04-12', maxValue: `${currentYear}-01-31` });

    await user.click(screen.getByRole('button', { name: /12 Apr 1990/ }));

    expect(screen.getByRole('option', { name: String(currentYear) })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: String(currentYear + 1) })).not.toBeInTheDocument();
  });
});
