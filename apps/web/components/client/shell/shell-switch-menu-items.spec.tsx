import type { PortalShellValue } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/auth-shell.json';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/admin/dashboard',
}));
vi.mock('#lib/auth/session-channel', () => ({
  openSessionChannel: vi.fn(() => ({ post: vi.fn(), close: vi.fn() })),
}));

const { ProfileMenu } = await import('./profile-menu');

function renderMenu(openableShells: PortalShellValue[]): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <ProfileMenu
          profile={{
            displayName: 'Ranti',
            isFallbackName: false,
            roleLabel: 'Front Nurse',
            email: 'ranti@klinik.test',
          }}
          openableShells={openableShells}
          currentShell="ADMIN"
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('shell switcher in the profile menu (P22-T05)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.cookie = 'hms_preferred_shell=; path=/; max-age=0';
  });

  it('offers the other shell and remembers the choice', async () => {
    const user = userEvent.setup();
    renderMenu(['ADMIN', 'DOCTOR']);

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pindah ke layar Dokter' }));

    expect(pushMock).toHaveBeenCalledWith('/doctor/dashboard');
    expect(document.cookie).toContain('hms_preferred_shell=DOCTOR');
  });

  it('offers nothing to a session with one shell', async () => {
    const user = userEvent.setup();
    renderMenu(['ADMIN']);

    await user.click(screen.getByRole('button', { name: 'Buka menu profil' }));
    await screen.findByRole('menuitem', { name: 'Keluar' });

    expect(screen.queryByRole('menuitem', { name: /Pindah ke/ })).toBeNull();
  });
});
