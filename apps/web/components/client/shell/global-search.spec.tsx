import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from './global-search';
import messages from '../../../messages/id/auth-shell.json';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('GlobalSearch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the patient directory with the encoded query on submit', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <GlobalSearch />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Cari pasien' }), 'chest pain');
    await user.keyboard('{Enter}');

    expect(pushMock).toHaveBeenCalledWith('/admin/patients?q=chest%20pain');
  });

  it('does not navigate when the query is blank', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <GlobalSearch />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Cari pasien' }), '   ');
    await user.keyboard('{Enter}');

    expect(pushMock).not.toHaveBeenCalled();
  });
});
