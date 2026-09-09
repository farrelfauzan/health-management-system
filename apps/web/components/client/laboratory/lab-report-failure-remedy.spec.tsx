import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LabReportFailureRemedy } from './lab-report-failure-remedy';
import operationsMessages from '../../../messages/id/operations.json';

function renderRemedy(rules: AppRule[]): void {
  render(
    <AbilityProvider ability={buildAppAbility(rules)}>
      <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
        <LabReportFailureRemedy code="CLINIC_PROFILE_MISSING" />
      </NextIntlClientProvider>
    </AbilityProvider>,
  );
}

/**
 * P18-T16. A render parked by a missing setting names the setting and, for
 * somebody who may change it, links to the screen — the retry button alone
 * was the half hour this ticket was spun out of.
 */
describe('LabReportFailureRemedy', () => {
  it('names the missing setting and links an administrator to it', () => {
    renderRemedy([{ action: 'write', subject: 'ClinicProfile' }]);

    expect(screen.getByText(/menunggu profil klinik/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buka profil klinik/i })).toHaveAttribute(
      'href',
      '/admin/administration?tab=clinic',
    );
  });

  it('tells somebody who cannot change it whom to ask, with no link', () => {
    renderRemedy([{ action: 'read', subject: 'LabOrder' }]);

    expect(screen.getByText(/minta administrator/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
