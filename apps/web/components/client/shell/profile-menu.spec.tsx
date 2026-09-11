import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileMenu } from './profile-menu';
import { endSession } from '#lib/auth/end-session';
import messages from '../../../messages/id/auth-shell.json';

vi.mock('#lib/auth/end-session', () => ({
  endSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('#lib/auth/session-channel', () => ({
  openSessionChannel: vi.fn(() => ({ post: vi.fn(), close: vi.fn() })),
}));

const endSessionMock = vi.mocked(endSession);

function renderProfileMenu(profileHref?: string): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <ProfileMenu
          profile={{
            displayName: 'Admin',
            roleLabel: 'Super Admin',
            roleKey: 'superAdmin',
            email: 'admin@salingjaga.com',
          }}
          profileHref={profileHref}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
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

    expect(endSessionMock).toHaveBeenCalledWith('LOGOUT', expect.anything());
  });

  /**
   * SJ-9 — the hand-off action. Recorded separately from logout so a clinic
   * can tell whether staff actually lock terminals, and it must reach the same
   * teardown so the query cache is cleared either way.
   */
  it('locks the workstation from the dropdown', async () => {
    const user = userEvent.setup();
    renderProfileMenu();

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Kunci komputer' }));

    expect(endSessionMock).toHaveBeenCalledWith('LOCK', expect.anything());
  });

  /** P20-T03 — only a shell with an own-profile page passes a link. */
  it('links to the own profile when the shell has one', async () => {
    const user = userEvent.setup();
    renderProfileMenu('/doctor/profile');

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));

    expect(await screen.findByRole('menuitem', { name: 'Profil saya' })).toHaveAttribute(
      'href',
      '/doctor/profile',
    );
  });

  it('offers no profile link in a shell without an own-profile page', async () => {
    const user = userEvent.setup();
    renderProfileMenu();

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));

    expect(await screen.findByRole('menuitem', { name: 'Keluar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Profil saya' })).not.toBeInTheDocument();
  });
});
