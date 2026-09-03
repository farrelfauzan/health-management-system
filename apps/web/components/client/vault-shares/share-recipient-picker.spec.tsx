import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idMessages from '../../../messages/id/vault.json';

const listRecipientsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  vaultShareRecipientControllerListShareRecipientsV1: listRecipientsMock,
}));

const { ShareRecipientPicker } = await import('./share-recipient-picker');

function renderPicker(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <ShareRecipientPicker selected={null} onSelect={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('ShareRecipientPicker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports a failed lookup as an error, not as "nobody matching"', async () => {
    // Regression. A route collision once made every search answer 400, and
    // this component rendered it as the empty-result message — a wrong answer
    // that looked like a right one, and cost real debugging time.
    listRecipientsMock.mockRejectedValue(new Error('boom'));
    renderPicker();

    await userEvent.type(screen.getByLabelText(idMessages.vault.sharing.recipient.label), 'admin');

    expect(await screen.findByText(idMessages.vault.sharing.recipient.error)).toBeInTheDocument();
    expect(screen.queryByText(idMessages.vault.sharing.recipient.empty)).not.toBeInTheDocument();
  });

  it('reports a genuinely empty result as empty', async () => {
    listRecipientsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPicker();

    await userEvent.type(screen.getByLabelText(idMessages.vault.sharing.recipient.label), 'zzz');

    expect(await screen.findByText(idMessages.vault.sharing.recipient.empty)).toBeInTheDocument();
  });

  it('does not call the API below the minimum search length', async () => {
    renderPicker();

    await userEvent.type(screen.getByLabelText(idMessages.vault.sharing.recipient.label), 'ab');

    expect(listRecipientsMock).not.toHaveBeenCalled();
    expect(screen.getByText(/minimal 3 karakter/)).toBeInTheDocument();
  });
});
