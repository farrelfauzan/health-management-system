import type { ReactNode } from 'react';
import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationUnitFormDialog } from './organization-unit-form-dialog';
import {
  organizationUnitControllerCreateUnitV1,
  organizationUnitControllerUpdateUnitV1,
} from '#lib/api/generated/organization-structure/organization-structure';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/organization-structure/organization-structure', () => ({
  organizationUnitControllerCreateUnitV1: vi.fn(),
  organizationUnitControllerUpdateUnitV1: vi.fn(),
}));

const createRequestMock = vi.mocked(organizationUnitControllerCreateUnitV1);
const updateRequestMock = vi.mocked(organizationUnitControllerUpdateUnitV1);

const EXISTING_UNIT: OrganizationUnitTreeNode = {
  id: 'unit-1',
  parentId: null,
  name: 'Clinical Services',
  kind: 'DIVISION',
  depth: 1,
  sortOrder: 0,
  memberCount: 4,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  children: [],
};

const PARENT_UNIT: OrganizationUnitTreeNode = { ...EXISTING_UNIT, id: 'parent-1', name: 'Nursing' };

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function renderDialog(props: {
  unit: OrganizationUnitTreeNode | null;
  parent: OrganizationUnitTreeNode | null;
}): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <OrganizationUnitFormDialog
        open
        onOpenChange={vi.fn()}
        unit={props.unit}
        parent={props.parent}
      />
    </QueryClientProvider>,
  );
}

function buildDepthError(): AxiosError {
  return new AxiosError(
    'Request failed with status code 400',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {},
      data: {
        error: {
          code: 'ORGANIZATION_UNIT_DEPTH_EXCEEDED',
          message: 'The organization structure is limited to 6 levels',
        },
      },
    } as AxiosResponse,
  );
}

describe('OrganizationUnitFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestMock.mockResolvedValue({
      status: 201,
      headers: {},
      data: { data: EXISTING_UNIT, message: 'Organization unit created' },
    } as never);
    updateRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: { data: EXISTING_UNIT, message: 'Organization unit updated' },
    } as never);
  });

  it('creates a root when no parent is given', async () => {
    const user = userEvent.setup();
    renderDialog({ unit: null, parent: null });

    await user.type(screen.getByLabelText('Name'), 'Support Services');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createRequestMock).toHaveBeenCalledWith({
      name: 'Support Services',
      kind: 'DEPARTMENT',
      parentId: null,
    });
  });

  it('creates under the parent it was opened from', async () => {
    const user = userEvent.setup();
    renderDialog({ unit: null, parent: PARENT_UNIT });

    await user.type(screen.getByLabelText('Name'), 'Ward A');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(createRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'parent-1' }),
    );
  });

  it('never sends a parent on an edit', async () => {
    // Re-parenting is its own endpoint because it rewrites every descendant's
    // ancestry; a rename that carried parentId would move a subtree by accident.
    const user = userEvent.setup();
    renderDialog({ unit: EXISTING_UNIT, parent: null });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRequestMock).toHaveBeenCalledWith('unit-1', {
      name: 'Clinical Services',
      kind: 'DIVISION',
    });
  });

  it('refuses to submit without a name', async () => {
    const user = userEvent.setup();
    renderDialog({ unit: null, parent: null });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the unit a name and a kind.');
    expect(createRequestMock).not.toHaveBeenCalled();
  });

  it("surfaces the API's depth refusal as its own message, not a generic failure", async () => {
    const user = userEvent.setup();
    createRequestMock.mockRejectedValue(buildDepthError());
    renderDialog({ unit: null, parent: PARENT_UNIT });

    await user.type(screen.getByLabelText('Name'), 'Too deep');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The organization structure is limited to 6 levels',
    );
  });
});
