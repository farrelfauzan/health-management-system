import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EncounterImmunizationForm } from './encounter-immunization-form';
import messages from '../../../messages/id/clinical.json';

const canMock = vi.fn<(action: string, subject: string) => boolean>(() => false);

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return { ...actual, useAbility: () => ({ can: canMock }) };
});

vi.mock('#lib/encounters/use-vaccine-catalog', () => ({
  useVaccineCatalog: () => ({ isPending: false, vaccines: [] }),
}));

function renderForm(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <EncounterImmunizationForm encounterId="encounter-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('EncounterImmunizationForm empty vaccine catalog', () => {
  beforeEach(() => {
    canMock.mockReset();
  });

  it('asks an administrator or pharmacist when the user cannot edit the catalog', () => {
    canMock.mockReturnValue(false);
    renderForm();
    expect(
      screen.getByText(messages.clinical.encounters.immunization.noVaccinesAskAdministrator),
    ).toBeInTheDocument();
    expect(canMock).toHaveBeenCalledWith('update', 'Medication');
  });

  it('points a catalog editor at the medication catalog', () => {
    canMock.mockReturnValue(true);
    renderForm();
    expect(
      screen.getByText(messages.clinical.encounters.immunization.noVaccines),
    ).toBeInTheDocument();
  });
});
