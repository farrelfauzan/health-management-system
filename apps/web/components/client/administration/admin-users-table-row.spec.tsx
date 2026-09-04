import type { AdminUser } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, Table, TableBody, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { AdminUsersTableRow } from './admin-users-table-row';
import messages from '../../../messages/en/operations.json';

const USER: AdminUser = {
  id: 'user-1',
  email: 'admin@hms.local',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  roles: [
    { code: 'ADMIN', name: 'Admin' },
    { code: 'SUPER_ADMIN', name: 'Super Admin' },
  ],
};

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'User' },
  { action: 'update', subject: 'User' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'User' }];

const SUPER_ADMIN_RULES: AppRule[] = [
  ...FULL_ACCESS_RULES,
  { action: 'offboard', subject: 'User' },
];

function renderRow(rules: AppRule[], user: AdminUser = USER, onOffboard = vi.fn()): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <Table>
          <TableBody>
            <AdminUsersTableRow
              user={user}
              onEdit={vi.fn()}
              onToggleActive={vi.fn()}
              onOffboard={onOffboard}
            />
          </TableBody>
        </Table>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('AdminUsersTableRow', () => {
  it('renders identity, role badges, status badge, and updated date', () => {
    renderRow(READ_ONLY_RULES);

    expect(screen.getByText('admin@hms.local')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Jul 10, 2026')).toBeInTheDocument();
  });

  it('shows edit and deactivate actions when the ability allows updates', async () => {
    const user = userEvent.setup();
    renderRow(FULL_ACCESS_RULES);

    await user.click(screen.getByRole('button', { name: 'Actions for admin@hms.local' }));

    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Deactivate')).toBeInTheDocument();
  });

  it('hides the actions menu for read-only abilities', () => {
    renderRow(READ_ONLY_RULES);

    expect(
      screen.queryByRole('button', { name: 'Actions for admin@hms.local' }),
    ).not.toBeInTheDocument();
  });

  describe('offboarding (P16-T41)', () => {
    it('offers Offboard only to a holder of the offboard key', async () => {
      const user = userEvent.setup();
      renderRow(FULL_ACCESS_RULES);

      await user.click(screen.getByRole('button', { name: 'Actions for admin@hms.local' }));

      // `user.update:any` is deactivate; offboarding is a separate key that
      // only a super admin holds, and a separate month of access.
      expect(await screen.findByText('Deactivate')).toBeInTheDocument();
      expect(screen.queryByText('Offboard')).not.toBeInTheDocument();
    });

    it('offers Offboard to a super admin and hands over the row', async () => {
      const user = userEvent.setup();
      const onOffboard = vi.fn();
      renderRow(SUPER_ADMIN_RULES, USER, onOffboard);

      await user.click(screen.getByRole('button', { name: 'Actions for admin@hms.local' }));
      await user.click(await screen.findByText('Offboard'));

      expect(onOffboard).toHaveBeenCalledWith(USER);
    });

    it('shows an offboarded person as offboarding, with Re-onboard in place of Offboard', async () => {
      const user = userEvent.setup();
      renderRow(SUPER_ADMIN_RULES, { ...USER, offboardedAt: '2026-09-04T10:00:00.000Z' });

      expect(screen.getByText('Offboarding')).toBeInTheDocument();
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Actions for admin@hms.local' }));

      expect(await screen.findByText('Re-onboard')).toBeInTheDocument();
      expect(screen.queryByText('Offboard')).not.toBeInTheDocument();
    });

    it('never offers Offboard for a deactivated account', async () => {
      // §7.3.10.2: deactivation already locks them out, and the API refuses
      // to turn that back into a month of access. No menu item that always
      // fails.
      const user = userEvent.setup();
      renderRow(SUPER_ADMIN_RULES, { ...USER, isActive: false });

      await user.click(screen.getByRole('button', { name: 'Actions for admin@hms.local' }));

      expect(await screen.findByText('Activate')).toBeInTheDocument();
      expect(screen.queryByText('Offboard')).not.toBeInTheDocument();
    });
  });
});
