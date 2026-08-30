import type { ReactNode } from 'react';
import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { render as testingRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationTreeTable } from './organization-tree-table';
import messages from '../../../messages/en/operations.json';

function buildNode(
  id: string,
  name: string,
  depth: number,
  children: OrganizationUnitTreeNode[] = [],
): OrganizationUnitTreeNode {
  return {
    id,
    parentId: null,
    name,
    kind: 'DEPARTMENT',
    depth,
    sortOrder: 0,
    memberCount: 0,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    children,
  };
}

const TREE: OrganizationUnitTreeNode[] = [
  buildNode('root-1', 'Direktorat Medis', 1, [
    buildNode('child-1', 'Rawat Jalan', 2, [buildNode('grandchild-1', 'Poli Umum', 3)]),
    buildNode('child-2', 'Rawat Inap', 2),
  ]),
  buildNode('root-2', 'Cabang Bekasi', 1),
];

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function renderTree(canManage = true): void {
  render(
    <OrganizationTreeTable
      roots={TREE}
      isPending={false}
      isError={false}
      canManage={canManage}
      onAddChild={vi.fn()}
      onEdit={vi.fn()}
      onMove={vi.fn()}
      onArchive={vi.fn()}
      onDelete={vi.fn()}
      onViewMembers={vi.fn()}
    />,
  );
}

describe('OrganizationTreeTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the chart as a treegrid, not a plain table', () => {
    // `treegrid` rather than `tree` because the rows genuinely have columns; a
    // plain tree would leave a screen reader unable to announce them.
    renderTree();

    expect(screen.getByRole('treegrid', { name: 'Organization' })).toBeInTheDocument();
  });

  it('opens roots by default and leaves deeper levels closed', () => {
    renderTree();

    expect(screen.getByText('Rawat Jalan')).toBeInTheDocument();
    // The grandchild sits under a collapsed child, so it is not rendered at all.
    expect(screen.queryByText('Poli Umum')).not.toBeInTheDocument();
  });

  it('reveals a subtree when the disclosure control is clicked', async () => {
    const user = userEvent.setup();
    renderTree();

    // The chevron is deliberately `aria-hidden`: the row already carries
    // `aria-expanded`, so announcing a second control for the same state would
    // be noise. It exists for pointer users, hence the `hidden: true` query.
    const branchRow = screen.getByText('Rawat Jalan').closest('tr') as HTMLElement;
    const disclosure = within(branchRow).getAllByRole('button', { hidden: true })[0];
    await user.click(disclosure as HTMLElement);

    expect(await screen.findByText('Poli Umum')).toBeInTheDocument();
  });

  it('expands and collapses a branch from the keyboard alone', async () => {
    // The path that matters: TanStack renders a table and gives no keyboard
    // model, so this is the behaviour SJ-90 actually had to write.
    const user = userEvent.setup();
    renderTree();

    const rootRow = screen.getByText('Direktorat Medis').closest('tr') as HTMLElement;
    rootRow.focus();
    // Down to the child branch, then Right to open it.
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(await screen.findByText('Poli Umum')).toBeInTheDocument();

    // Left closes it again rather than stepping out, because it is now open.
    await user.keyboard('{ArrowLeft}');
    expect(screen.queryByText('Poli Umum')).not.toBeInTheDocument();
  });

  it('jumps to a unit by typing its first letter', async () => {
    const user = userEvent.setup();
    renderTree();

    const rootRow = screen.getByText('Direktorat Medis').closest('tr') as HTMLElement;
    rootRow.focus();
    await user.keyboard('c');

    expect(screen.getByText('Cabang Bekasi').closest('tr')).toHaveFocus();
  });

  it('announces level and sibling position on every row', () => {
    renderTree();

    const rootRow = screen.getByText('Direktorat Medis').closest('tr');
    const childRow = screen.getByText('Rawat Inap').closest('tr');

    expect(rootRow).toHaveAttribute('aria-level', '1');
    expect(rootRow).toHaveAttribute('aria-posinset', '1');
    expect(rootRow).toHaveAttribute('aria-setsize', '2');
    expect(childRow).toHaveAttribute('aria-level', '2');
    expect(childRow).toHaveAttribute('aria-posinset', '2');
  });

  it('marks expandable rows with aria-expanded and leaves leaves alone', () => {
    // `aria-expanded="false"` on a leaf would tell a screen reader there is
    // something to open when there is not.
    renderTree();

    expect(screen.getByText('Direktorat Medis').closest('tr')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Rawat Jalan').closest('tr')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Cabang Bekasi').closest('tr')).not.toHaveAttribute('aria-expanded');
  });

  it('keeps the grid to a single tab stop with a roving tabindex', () => {
    // Otherwise a 200-unit chart is 200 tab stops between the toolbar and
    // whatever follows it.
    renderTree();

    const rows = screen.getAllByRole('row').filter((row) => row.hasAttribute('data-tree-row'));
    const tabbable = rows.filter((row) => row.getAttribute('tabindex') === '0');

    expect(tabbable).toHaveLength(1);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('offers only the members action to an account that cannot manage', () => {
    renderTree(false);

    const rootRow = screen.getByText('Direktorat Medis').closest('tr');
    expect(
      within(rootRow as HTMLElement).getByRole('button', {
        name: 'Actions for Direktorat Medis',
      }),
    ).toBeInTheDocument();
  });
});
