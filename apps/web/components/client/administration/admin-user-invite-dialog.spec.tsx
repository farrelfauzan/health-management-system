import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUserInviteDialog } from './admin-user-invite-dialog';
import { userInvitationAdminControllerCreateInvitationV1 } from '#lib/api/generated/admin-management/admin-management';
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
  userInvitationAdminControllerCreateInvitationV1: vi.fn(),
}));

vi.mock('#lib/api/generated/rbac/rbac', () => ({
  rbacControllerGetRolesV1: vi.fn(),
  getRbacControllerGetRolesV1QueryKey: () => ['/api/v1/rbac/roles'],
}));

const inviteRequestMock = vi.mocked(userInvitationAdminControllerCreateInvitationV1);
const rolesRequestMock = vi.mocked(rbacControllerGetRolesV1);

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
        error: { code: 'CONFLICT', message: 'An invitation for this email is already pending' },
      },
    } as AxiosResponse,
  );
}

function renderDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminUserInviteDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('AdminUserInviteDialog', () => {
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
    inviteRequestMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: {
        data: {
          id: 'invitation-1',
          email: 'new-admin@hms.local',
          status: 'PENDING',
          roles: [{ code: 'ADMIN', name: 'Admin' }],
          invitedByEmail: 'admin@hms.local',
          expiresAt: '2026-07-04T00:00:00.000Z',
          createdAt: '2026-07-01T00:00:00.000Z',
          consumedAt: null,
          revokedAt: null,
        },
        message: 'Invitation sent',
      },
    } as never);
  });

  it('sends an invitation with the selected roles', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Email'), 'new-admin@hms.local');
    await user.click(await screen.findByText('Admin'));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(inviteRequestMock).toHaveBeenCalledWith({
      email: 'new-admin@hms.local',
      roleCodes: ['ADMIN'],
    });
  });

  // The point of the ticket: there is nowhere in this dialog to type someone
  // else's password, so nobody at the clinic can learn it.
  it('offers no password field at all', () => {
    renderDialog();

    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('requires at least one role before submitting', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Email'), 'new-admin@hms.local');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText('Select at least one role')).toBeInTheDocument();
    expect(inviteRequestMock).not.toHaveBeenCalled();
  });

  it('surfaces the API error envelope message on conflicts', async () => {
    const user = userEvent.setup();
    inviteRequestMock.mockRejectedValue(buildConflictError());
    renderDialog();

    await user.type(screen.getByLabelText('Email'), 'existing@hms.local');
    await user.click(await screen.findByText('Admin'));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An invitation for this email is already pending',
    );
  });
});
