import type { ReactNode } from 'react';
import type { AdminUser } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUserFormDialog } from './admin-user-form-dialog';
import { adminManagementControllerUpdateAdminUserV1 } from '#lib/api/generated/admin-management/admin-management';
import { rbacControllerGetRolesV1 } from '#lib/api/generated/rbac/rbac';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

vi.mock('#lib/api/generated/admin-management/admin-management', () => ({
  adminManagementControllerUpdateAdminUserV1: vi.fn(),
}));

vi.mock('#lib/api/generated/rbac/rbac', () => ({
  rbacControllerGetRolesV1: vi.fn(),
  getRbacControllerGetRolesV1QueryKey: () => ['/api/v1/rbac/roles'],
}));

const updateRequestMock = vi.mocked(adminManagementControllerUpdateAdminUserV1);
const rolesRequestMock = vi.mocked(rbacControllerGetRolesV1);

const EXISTING_USER: AdminUser = {
  id: 'user-1',
  email: 'existing@hms.local',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  roles: [{ code: 'ADMIN', name: 'Admin' }],
};

function buildConflictError(): AxiosError {
  return new AxiosError(
    'Request failed with status code 409',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {},
      data: {
        error: { code: 'CONFLICT', message: 'User email already exists' },
      },
    } as AxiosResponse,
  );
}

function renderDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminUserFormDialog open onOpenChange={vi.fn()} user={EXISTING_USER} />
    </QueryClientProvider>,
  );
}

describe('AdminUserFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rolesRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: [
          { id: 'role-1', code: 'ADMIN', name: 'Admin' },
          { id: 'role-2', code: 'DOCTOR', name: 'Doctor' },
        ],
      },
    } as never);
    updateRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: EXISTING_USER, message: 'User updated' },
    } as never);
  });

  // IMP-23 moved account creation to `AdminUserInviteDialog`. This dialog only
  // edits, and the password field is now a reset for someone locked out — so
  // leaving it blank has to be the ordinary case, not a validation failure.
  it('saves without touching the password when the field is left blank', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    expect(updateRequestMock).toHaveBeenCalledWith('user-1', {
      email: 'existing@hms.local',
      roleCodes: ['ADMIN'],
      isActive: true,
    });
  });

  it('sends a new password only when one is typed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('New Password (optional)'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updateRequestMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ password: 'password123' }),
    );
  });

  it('requires at least one role before submitting', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByText('Admin'));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Select at least one role')).toBeInTheDocument();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it('surfaces the API error envelope message on conflicts', async () => {
    const user = userEvent.setup();
    updateRequestMock.mockRejectedValue(buildConflictError());
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('User email already exists');
  });
});
