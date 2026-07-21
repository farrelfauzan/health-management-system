import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileMenu } from './profile-menu';
import { executeLogout } from '#lib/auth/logout';

vi.mock('#lib/auth/logout', () => ({
  executeLogout: vi.fn().mockResolvedValue(undefined),
}));

const executeLogoutMock = vi.mocked(executeLogout);

describe('ProfileMenu', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the profile name and role from the session claims', () => {
    render(<ProfileMenu profile={{ displayName: 'Admin', roleLabel: 'Super Admin' }} />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
  });

  it('executes the logout flow from the dropdown', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu profile={{ displayName: 'Admin', roleLabel: 'Super Admin' }} />);

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /log out/i }));

    expect(executeLogoutMock).toHaveBeenCalledTimes(1);
  });
});
