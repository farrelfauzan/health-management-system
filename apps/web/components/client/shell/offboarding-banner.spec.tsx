import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { OffboardingBanner } from './offboarding-banner';
import idMessages from '../../../messages/id/vault.json';

describe('OffboardingBanner', () => {
  it('names the deletion date and links to the vault, in the clinic language', () => {
    render(
      <NextIntlClientProvider locale="id" messages={idMessages} timeZone="Asia/Jakarta">
        <OffboardingBanner deadline="2026-10-04" vaultHref="/doctor/vault" />
      </NextIntlClientProvider>,
    );

    // A calendar day, rendered as that day whatever zone the browser is in.
    expect(screen.getByRole('status')).toHaveTextContent('4 Oktober 2026');
    expect(screen.getByText(/tetap dapat dibuka oleh penerimanya/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ekspor semuanya/ })).toHaveAttribute(
      'href',
      '/doctor/vault',
    );
  });
});
