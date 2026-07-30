import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileMenu } from './profile-menu';
import { executeLogout } from '#lib/auth/logout';
import messages from '../../../messages/id/auth-shell.json';

vi.mock('#lib/auth/logout', () => ({
  executeLogout: vi.fn().mockResolvedValue(undefined),
}));

const executeLogoutMock = vi.mocked(executeLogout);

function renderProfileMenu(): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ProfileMenu
        profile={{
          displayName: 'Admin',
          roleLabel: 'Super Admin',
          roleKey: 'superAdmin',
          email: 'admin@salingjaga.com',
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe('ProfileMenu', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the profile name and role from the session claims', () => {
    renderProfileMenu();

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
  });

  it('executes the logout flow from the dropdown', async () => {
    const user = userEvent.setup();
    renderProfileMenu();

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Keluar' }));

    expect(executeLogoutMock).toHaveBeenCalledTimes(1);
  });
});
