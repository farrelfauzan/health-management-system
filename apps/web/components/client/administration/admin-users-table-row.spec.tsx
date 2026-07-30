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

function renderRow(rules: AppRule[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(rules)}>
        <Table>
          <TableBody>
            <AdminUsersTableRow user={USER} onEdit={vi.fn()} onToggleActive={vi.fn()} />
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
});
