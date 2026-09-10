import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LocalizedPasswordInput } from './localized-password-input';
import enMessages from '../../../messages/en/shared.json';
import idMessages from '../../../messages/id/shared.json';

function renderPasswordInput(locale: 'en' | 'id', isDisabled = false) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : idMessages}>
      <label htmlFor="password">Password</label>
      <LocalizedPasswordInput id="password" defaultValue="s3cret" disabled={isDisabled} />
    </NextIntlClientProvider>,
  );
}

describe('LocalizedPasswordInput', () => {
  it('starts masked', () => {
    renderPasswordInput('en');

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('reveals and re-masks the value, naming the next action each time', async () => {
    const user = userEvent.setup();
    renderPasswordInput('en');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password')).toHaveValue('s3cret');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('names the button in Indonesian', () => {
    renderPasswordInput('id');

    expect(screen.getByRole('button', { name: 'Tampilkan kata sandi' })).toBeInTheDocument();
  });

  it('disables the toggle along with the field', () => {
    renderPasswordInput('en', true);

    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });
});
