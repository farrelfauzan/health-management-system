import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

const addProcedureMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/encounters/encounters', () => ({
  encounterClinicalDataControllerAddProcedureV1: (...args: unknown[]) => addProcedureMock(...args),
}));

vi.mock('#lib/api/notify-api-error', () => ({
  notifyApiError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('#lib/encounters/use-icd9cm-search', () => ({
  useIcd9cmSearch: () => ({ codes: [], isPending: false, isEnabled: false }),
}));

vi.mock('#components/client/encounters/code-search-picker', () => ({
  CodeSearchPicker: (props: { onSelect: (option: { id: string; code: string; display: string }) => void }) => (
    <button
      type="button"
      onClick={() =>
        props.onSelect({ id: 'icd9cm-69-7', code: '69.7', display: 'Insertion of contraceptive device' })
      }
    >
      pick-69.7
    </button>
  ),
}));

const { EncounterProcedureForm } = await import('./encounter-procedure-form');

describe('EncounterProcedureForm midwife authority refusal (P25-T03)', () => {
  it('renders the inline refusal with the authority label and the referral hint', async () => {
    addProcedureMock.mockRejectedValue(
      new AxiosError('Unprocessable', '422', undefined, undefined, {
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          error: {
            code: 'MIDWIFE_AUTHORITY_REQUIRED',
            message: 'refused',
            details: { kind: 'IUD_IMPLANT' },
          },
        },
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <QueryClientProvider client={queryClient}>
          <EncounterProcedureForm encounterId="encounter-1" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick-69.7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Tindakan' }));

    await waitFor(() => {
      expect(screen.getByTestId('midwife-authority-refusal')).toBeTruthy();
    });
    expect(
      screen.getByText('Bidan belum memiliki kewenangan aktif untuk Pemasangan AKDR & implan.'),
    ).toBeTruthy();
    expect(screen.getByText('Rujuk ke dokter atau puskesmas')).toBeTruthy();
    expect(addProcedureMock.mock.calls[0]?.[1]).toEqual({ icd9cmCodeId: 'icd9cm-69-7' });
  });
});
