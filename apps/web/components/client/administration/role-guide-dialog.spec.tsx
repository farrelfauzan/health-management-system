import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

vi.mock('#lib/api/generated/rbac/rbac', () => ({
  getRbacControllerGetPermissionCatalogV1QueryKey: () => ['/api/v1/rbac/permissions'],
  rbacControllerGetPermissionCatalogV1: vi.fn().mockResolvedValue({
    status: 200,
    headers: {},
    data: {
      data: [
        {
          resource: 'Encounter',
          permissions: [
            {
              id: 'p1',
              permissionKey: 'encounter.record-vitals:any',
              resource: 'Encounter',
              action: 'record-vitals',
              scope: 'ANY',
              description: 'Record vital signs (triage)',
              requires: ['portal.admin-access:any'],
              effects: { requiresMfa: false, portal: null, isClinicalContent: true },
            },
          ],
        },
      ],
    },
  }),
}));

const { RoleGuideDialog } = await import('./role-guide-dialog');

describe('RoleGuideDialog (P22-T05)', () => {
  it('lists each template with its permissions in the catalogue words', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="id" messages={messages}>
          <RoleGuideDialog open onOpenChange={vi.fn()} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Record vital signs (triage)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Perawat depan' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kasir' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resepsionis' })).toBeInTheDocument();
  });
});
