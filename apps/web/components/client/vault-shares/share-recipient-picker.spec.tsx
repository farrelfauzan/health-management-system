import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import idMessages from '../../../messages/id/vault.json';

const listRecipientsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/document-management/document-management', () => ({
  vaultShareRecipientControllerListShareRecipientsV1: listRecipientsMock,
}));

const { ShareRecipientPicker } = await import('./share-recipient-picker');

type Recipient = { id: string; email: string; roleCodes: string[] };

const ADMIN_ONE: Recipient = { id: 'user-1', email: 'admin-satu@example.test', roleCodes: ['ADMIN'] };
const ADMIN_TWO: Recipient = { id: 'user-2', email: 'admin-dua@example.test', roleCodes: ['ADMIN'] };

function renderPicker(
  selected: Recipient[] = [],
  onChange: (recipients: Recipient[]) => void = () => {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <ShareRecipientPicker selected={selected as never} onChange={onChange as never} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function openAndSearch(term: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.type(
    screen.getByPlaceholderText(idMessages.vault.sharing.recipient.searchPlaceholder),
    term,
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

    await openAndSearch('admin');

    expect(await screen.findByText(idMessages.vault.sharing.recipient.error)).toBeInTheDocument();
    expect(screen.queryByText(idMessages.vault.sharing.recipient.empty)).not.toBeInTheDocument();
  });

  it('reports a genuinely empty result as empty', async () => {
    listRecipientsMock.mockResolvedValue({ status: 200, data: { data: [] } });
    renderPicker();

    await openAndSearch('zzz');

    expect(await screen.findByText(idMessages.vault.sharing.recipient.empty)).toBeInTheDocument();
  });

  it('does not call the API below the minimum search length', async () => {
    renderPicker();

    await openAndSearch('ab');

    expect(screen.getByText(/minimal 3 karakter/)).toBeInTheDocument();
    // Past the debounce, still nothing sent: the guard is on length, not time.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listRecipientsMock).not.toHaveBeenCalled();
  });

  it('adds a pick to the ones already made rather than replacing them', async () => {
    // The whole point of the multi-select: sharing with a team is one dialog,
    // not one dialog per colleague.
    listRecipientsMock.mockResolvedValue({ status: 200, data: { data: [ADMIN_ONE, ADMIN_TWO] } });
    const onChange = vi.fn();
    renderPicker([ADMIN_ONE], onChange);

    await openAndSearch('admin');
    await userEvent.click(await screen.findByRole('option', { name: /admin-dua/ }));

    expect(onChange).toHaveBeenCalledWith([ADMIN_ONE, ADMIN_TWO]);
  });

  it('keeps a chip for a pick the current search no longer returns, and can remove it', async () => {
    listRecipientsMock.mockResolvedValue({ status: 200, data: { data: [ADMIN_TWO] } });
    const onChange = vi.fn();
    renderPicker([ADMIN_ONE], onChange);

    expect(screen.getByText(ADMIN_ONE.email)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: `Hapus ${ADMIN_ONE.email}` }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });
});
