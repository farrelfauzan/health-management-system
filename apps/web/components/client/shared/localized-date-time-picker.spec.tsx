import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LocalizedDateTimePicker } from './localized-date-time-picker';
import enMessages from '../../../messages/en/shared.json';

function renderDateTimePicker(value: string) {
  const onValueChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocalizedDateTimePicker value={value} onValueChange={onValueChange} />
    </NextIntlClientProvider>,
  );
  return { onValueChange };
}

async function pickTime(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  hour: string,
  minute: string,
) {
  await user.click(trigger);
  await user.click(
    within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: hour }),
  );
  await user.click(
    within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: minute }),
  );
}

describe('LocalizedDateTimePicker', () => {
  it('holds a time picked before any date, and emits nothing until a date exists', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderDateTimePicker('');

    await pickTime(user, screen.getByRole('button', { name: /Pick a time/ }), '10', '15');

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /10:15/ })).toBeInTheDocument();
  });

  it('keeps the date when only the time changes, in the datetime-local format', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderDateTimePicker('2026-09-14T10:15');

    expect(screen.getByRole('button', { name: /14 Sep 2026/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /10:15/ }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '11' }),
    );

    expect(onValueChange).toHaveBeenLastCalledWith('2026-09-14T11:15');
  });

  it('empties the value when the date is cleared, so an optional field can be unset', async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderDateTimePicker('2026-09-14T10:15');

    await user.click(screen.getByRole('button', { name: /14 Sep 2026/ }));
    await user.click(screen.getByRole('button', { name: /September 14/ }));

    expect(onValueChange).toHaveBeenLastCalledWith('');
  });
});
