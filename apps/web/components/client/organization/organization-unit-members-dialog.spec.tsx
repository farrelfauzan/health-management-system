import type { ReactNode } from 'react';
import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationUnitMembersDialog } from './organization-unit-members-dialog';
import { adminManagementControllerListUsersV1 } from '#lib/api/generated/admin-management/admin-management';
import { organizationUnitMemberControllerListMembersV1 } from '#lib/api/generated/organization-structure/organization-structure';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/organization-structure/organization-structure', () => ({
  organizationUnitMemberControllerListMembersV1: vi.fn(),
  organizationUnitMemberControllerUnassignMemberV1: vi.fn(),
  organizationUnitMemberControllerAssignMemberV1: vi.fn(),
  getOrganizationUnitMemberControllerListMembersV1QueryKey: () => [
    '/api/v1/organization-units/unit-1/members',
  ],
}));

vi.mock('#lib/api/generated/admin-management/admin-management', () => ({
  adminManagementControllerListUsersV1: vi.fn(),
  getAdminManagementControllerListUsersV1QueryKey: () => ['/api/v1/users'],
}));

const listMembersMock = vi.mocked(organizationUnitMemberControllerListMembersV1);
const listUsersMock = vi.mocked(adminManagementControllerListUsersV1);

const UNIT: OrganizationUnitTreeNode = {
  id: 'unit-1',
  parentId: null,
  name: 'Nursing',
  kind: 'DEPARTMENT',
  depth: 1,
  sortOrder: 0,
  memberCount: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  children: [],
};

const MANAGE_RULES: AppRule[] = [
  { action: 'read', subject: 'OrganizationUnit' },
  { action: 'manage', subject: 'OrganizationUnitMember' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'OrganizationUnit' }];

function render(node: ReactNode, rules: AppRule[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider ability={buildAppAbility(rules)}>{node}</AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function renderDialog(rules: AppRule[], unit: OrganizationUnitTreeNode = UNIT): void {
  render(<OrganizationUnitMembersDialog open onOpenChange={vi.fn()} unit={unit} />, rules);
}

describe('OrganizationUnitMembersDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMembersMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: [
          { userId: 'user-1', email: 'maya.sari@clinic.local', isActive: true, roles: ['DOCTOR'] },
        ],
        meta: { page: 1, limit: 20, total: 1 },
      },
    } as never);
    listUsersMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: [{ id: 'user-2', email: 'andi@clinic.local', isActive: true, roles: [] }],
        meta: { page: 1, limit: 100, total: 1 },
      },
    } as never);
  });

  it('lists the members of the unit', async () => {
    renderDialog(MANAGE_RULES);

    expect(await screen.findByText('maya.sari@clinic.local')).toBeInTheDocument();
    expect(screen.getByText('DOCTOR')).toBeInTheDocument();
  });

  it('offers the add-member picker to an account holding the member grant', async () => {
    renderDialog(MANAGE_RULES);

    expect(await screen.findByRole('button', { name: /Add member/ })).toBeInTheDocument();
  });

  it('hides the picker from an account that may only read the structure', async () => {
    // The permission split made visible: this account can see who is in the
    // unit and change nothing about it.
    renderDialog(READ_ONLY_RULES);

    expect(await screen.findByText('maya.sari@clinic.local')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add member/ })).not.toBeInTheDocument();
  });

  it('hides the picker on an archived unit even with the member grant', async () => {
    // The API refuses assignment into an archived unit, so offering the control
    // would be offering a button that always fails.
    renderDialog(MANAGE_RULES, { ...UNIT, archivedAt: '2026-09-08T00:00:00.000Z' });

    expect(await screen.findByText('maya.sari@clinic.local')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add member/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('This unit is archived; members cannot be added to it.'),
    ).toBeInTheDocument();
  });
});
