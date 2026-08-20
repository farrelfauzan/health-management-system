import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RolePermissionsDialog } from './role-permissions-dialog';
import {
  rbacControllerGetPermissionCatalogV1,
  rbacControllerGetRoleByIdV1,
  rbacControllerSetRolePermissionsV1,
} from '#lib/api/generated/rbac/rbac';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

vi.mock('#lib/api/generated/rbac/rbac', () => ({
  rbacControllerGetPermissionCatalogV1: vi.fn(),
  getRbacControllerGetPermissionCatalogV1QueryKey: () => ['/api/v1/rbac/permissions'],
  rbacControllerGetRoleByIdV1: vi.fn(),
  getRbacControllerGetRoleByIdV1QueryKey: (id: string) => [`/api/v1/rbac/roles/${id}`],
  rbacControllerSetRolePermissionsV1: vi.fn(),
  getRbacControllerGetRolesV1QueryKey: () => ['/api/v1/rbac/roles'],
}));

const catalogRequestMock = vi.mocked(rbacControllerGetPermissionCatalogV1);
const detailRequestMock = vi.mocked(rbacControllerGetRoleByIdV1);
const saveRequestMock = vi.mocked(rbacControllerSetRolePermissionsV1);

const CUSTOM_ROLE = {
  id: 'role-9',
  code: 'FRONT_DESK_LEAD',
  name: 'Front Desk Lead',
  isSystem: false,
  memberCount: 2,
};

const CATALOG_GROUPS = [
  {
    resource: 'Patient',
    permissions: [
      {
        id: 'p1',
        permissionKey: 'patient.read:any',
        resource: 'Patient',
        action: 'read',
        scope: 'ANY',
        description: 'Read all patients',
      },
      {
        id: 'p2',
        permissionKey: 'patient.read:own',
        resource: 'Patient',
        action: 'read',
        scope: 'OWN',
        description: 'Read own record',
      },
    ],
  },
];

function renderDialog(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RolePermissionsDialog role={CUSTOM_ROLE} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('RolePermissionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: CATALOG_GROUPS },
    } as never);
    detailRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          ...CUSTOM_ROLE,
          description: null,
          permissions: [CATALOG_GROUPS[0]?.permissions[0]],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    } as never);
    saveRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: {} },
    } as never);
  });

  it("pre-ticks the role's attached permissions from the detail endpoint", async () => {
    renderDialog();

    const anyCheckbox = await screen.findByLabelText('patient.read:any');
    const ownCheckbox = screen.getByLabelText('patient.read:own');

    expect(anyCheckbox).toBeChecked();
    expect(ownCheckbox).not.toBeChecked();
  });

  it('saves the edited selection as the full replacement set', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByLabelText('patient.read:own'));
    await user.click(screen.getByLabelText('patient.read:any'));
    await user.click(screen.getByRole('button', { name: 'Save permissions' }));

    await waitFor(() => {
      expect(saveRequestMock).toHaveBeenCalledWith('role-9', {
        permissionKeys: ['patient.read:own'],
      });
    });
  });
});
