import type { ImmunizationResponse } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/encounters/encounters', () => ({
  encounterClinicalDataControllerRemoveImmunizationV1: vi.fn(),
}));

const { EncounterImmunizationRow } = await import('./encounter-immunization-row');

function buildImmunization(overrides: Partial<ImmunizationResponse> = {}): ImmunizationResponse {
  return {
    id: 'imm-1',
    encounterId: 'enc-1',
    patientId: 'pat-1',
    medicationId: 'med-1',
    medicationName: 'Vaksin DPT-HB-Hib',
    kfaCode: '93000123',
    occurredAt: '2026-07-28T02:10:00.000Z',
    doseNumber: 3,
    lotNumber: 'LOT-DPT-2026-04',
    route: 'IM',
    site: 'LEFT_THIGH',
    createdAt: '2026-07-28T02:10:00.000Z',
    updatedAt: '2026-07-28T02:10:00.000Z',
    ...overrides,
  };
}

function renderRow(immunization: ImmunizationResponse, isEditable = true): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <ul>
          <EncounterImmunizationRow
            encounterId="enc-1"
            immunization={immunization}
            isEditable={isEditable}
          />
        </ul>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('EncounterImmunizationRow', () => {
  it('names the vaccine and the facts a clinician reads off the card', () => {
    renderRow(buildImmunization());

    expect(screen.getByText('Vaksin DPT-HB-Hib')).toBeInTheDocument();
    expect(screen.getByText(/Dosis ke-3/)).toBeInTheDocument();
    expect(screen.getByText(/LOT-DPT-2026-04/)).toBeInTheDocument();
    expect(screen.getByText(/Paha kiri/)).toBeInTheDocument();
  });

  it('omits the details that were not recorded rather than showing blanks', () => {
    renderRow(
      buildImmunization({
        doseNumber: undefined,
        lotNumber: undefined,
        route: undefined,
        site: undefined,
      }),
    );

    expect(screen.queryByText(/Dosis ke-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lot /)).not.toBeInTheDocument();
  });

  it('warns when the vaccine has no KFA code — it will never be reported', () => {
    renderRow(buildImmunization({ kfaCode: undefined }));

    expect(screen.getByText(/Tanpa kode KFA/)).toBeInTheDocument();
  });

  it('says nothing about KFA when the vaccine is coded', () => {
    renderRow(buildImmunization());

    expect(screen.queryByText(/Tanpa kode KFA/)).not.toBeInTheDocument();
  });

  it('offers no retract control on a closed encounter', () => {
    renderRow(buildImmunization(), false);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
