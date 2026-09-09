import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LabReleaseDialog } from './lab-release-dialog';
import operationsMessages from '../../../messages/id/operations.json';

const releaseMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/laboratory-results/laboratory-results', () => ({
  labResultControllerReleaseLabOrderV1: releaseMock,
}));

function renderDialog(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
        <LabReleaseDialog labOrderId="o1" open onOpenChange={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/**
 * P18-T14. The note is optional and travels trimmed; a release with nothing
 * typed sends no note at all, so the sheet prints no empty block for it.
 */
describe('LabReleaseDialog', () => {
  beforeEach(() => {
    releaseMock.mockReset();
    releaseMock.mockResolvedValue({ status: 200, data: { data: {} } });
  });

  it('sends the trimmed note with the release', async () => {
    renderDialog();

    await userEvent.type(
      screen.getByTestId('lab-release-note'),
      '  Sampel lipemik, ulangi puasa 12 jam.  ',
    );
    await userEvent.click(screen.getByTestId('lab-release-confirm'));

    await waitFor(() =>
      expect(releaseMock).toHaveBeenCalledWith('o1', {
        note: 'Sampel lipemik, ulangi puasa 12 jam.',
      }),
    );
  });

  it('releases without a note when nothing was typed', async () => {
    renderDialog();

    await userEvent.click(screen.getByTestId('lab-release-confirm'));

    await waitFor(() => expect(releaseMock).toHaveBeenCalledWith('o1', {}));
  });

  it('says what the field is for rather than just "Catatan"', () => {
    renderDialog();

    expect(screen.getByPlaceholderText(/sampel lipemik/i)).toBeInTheDocument();
  });
});
