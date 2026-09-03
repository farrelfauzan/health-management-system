import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/id/operations.json';
import { ExpiredLicenceWarning } from './expired-licence-warning';

function renderWarning(expiredLicenses?: Array<Record<string, string>>): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ExpiredLicenceWarning expiredLicenses={expiredLicenses as never} />
    </NextIntlClientProvider>,
  );
}

describe('ExpiredLicenceWarning', () => {
  it('names the lapsed licence and its expiry date', () => {
    renderWarning([{ type: 'SIP', licenseNumber: 'SIP-EXAMPLE-0001', expiresAt: '2026-08-20' }]);

    expect(screen.getByRole('alert')).toHaveTextContent('SIP SIP-EXAMPLE-0001');
    expect(screen.getByRole('alert')).toHaveTextContent('2026-08-20');
  });

  it('says plainly that booking still proceeds', () => {
    // US-E3-09: v1 warns, it does not block. A banner that read like a
    // refusal would have schedulers looking for an override that is not there.
    renderWarning([{ type: 'SIP', licenseNumber: 'SIP-EXAMPLE-0001', expiresAt: '2026-08-20' }]);

    expect(
      screen.getByText(messages.operations.appointments.expiredLicence.bookingProceeds),
    ).toBeInTheDocument();
  });

  it('lists both when STR and SIP have lapsed', () => {
    renderWarning([
      { type: 'STR', licenseNumber: 'STR-EXAMPLE-0002', expiresAt: '2026-07-01' },
      { type: 'SIP', licenseNumber: 'SIP-EXAMPLE-0001', expiresAt: '2026-08-20' },
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders nothing when the doctor’s permits are current', () => {
    renderWarning([]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing when the viewer is not told about licences at all', () => {
    // The patient-portal case: the field is absent rather than empty, and an
    // absent field must read as "no information", never as "all clear".
    renderWarning(undefined);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
