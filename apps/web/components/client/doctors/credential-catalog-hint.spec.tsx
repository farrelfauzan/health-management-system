import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { CredentialCatalogHint } from './credential-catalog-hint';
import messages from '../../../messages/id/clinical.json';

function renderHint(isSelfService?: boolean): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <CredentialCatalogHint isSelfService={isSelfService} />
    </NextIntlClientProvider>,
  );
}

describe('CredentialCatalogHint', () => {
  it('links an administrator to the credential catalog', () => {
    renderHint();
    expect(
      screen.getByRole('link', { name: messages.clinical.doctors.credentials.manageLink }),
    ).toHaveAttribute('href', '/admin/settings/doctor-credentials');
  });

  it('tells a doctor editing their own profile to ask an administrator instead', () => {
    renderHint(true);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.getByText(messages.clinical.doctors.credentials.askAdministrator),
    ).toBeInTheDocument();
  });
});
