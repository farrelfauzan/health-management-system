import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileMenu } from './profile-menu';
import { endSession } from '#lib/auth/end-session';
import type { ShellProfile } from '#lib/shell/shell-profile';
import messages from '../../../messages/id/auth-shell.json';

vi.mock('#lib/auth/end-session', () => ({
  endSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('#lib/auth/session-channel', () => ({
  openSessionChannel: vi.fn(() => ({ post: vi.fn(), close: vi.fn() })),
}));

const endSessionMock = vi.mocked(endSession);

const NAMED_PROFILE: ShellProfile = {
  displayName: 'Admin',
  isFallbackName: false,
  roleLabel: 'Super Admin',
  roleKey: 'superAdmin',
  email: 'admin@salingjaga.com',
};

function renderProfileMenu(profileHref?: string, profile: ShellProfile = NAMED_PROFILE): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <ProfileMenu profile={profile} profileHref={profileHref} />
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

  describe('names (P20-T08)', () => {
    it('greets a named pharmacist by name, with a matching avatar initial', () => {
      renderProfileMenu(undefined, {
        displayName: 'Rina Apoteker',
        isFallbackName: false,
        roleLabel: 'Pharmacist',
        roleKey: 'pharmacist',
        email: 'apotek1@klinik.id',
      });

      expect(screen.getByText('Rina Apoteker')).toBeInTheDocument();
      expect(screen.getByText('RA')).toBeInTheDocument();
    });

    it('shows an unnamed account its address, verbatim, and does not repeat it', async () => {
      const user = userEvent.setup();
      renderProfileMenu(undefined, {
        displayName: 'apotek1@klinik.id',
        isFallbackName: true,
        roleLabel: 'Pharmacist',
        roleKey: 'pharmacist',
        email: 'apotek1@klinik.id',
      });

      await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));

      expect(await screen.findAllByText('apotek1@klinik.id')).toHaveLength(2);
      expect(screen.queryByText('Apotek1')).not.toBeInTheDocument();
      expect(screen.getAllByText('Apoteker')).toHaveLength(2);
    });

    it('uses the translated placeholder only with neither a name nor an address', () => {
      renderProfileMenu(undefined, {
        displayName: 'MetaKlinik User',
        isFallbackName: true,
        roleLabel: 'Staff',
        roleKey: 'staff',
        email: '',
      });

      expect(screen.getByText('Pengguna MetaKlinik')).toBeInTheDocument();
    });
  });
});
