import type { ReactNode } from 'react';
import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import { render as testingRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { OrganizationChartView } from './organization-chart-view';
import messages from '../../../messages/en/operations.json';

function buildNode(
  id: string,
  name: string,
  children: OrganizationUnitTreeNode[] = [],
  archivedAt?: string,
): OrganizationUnitTreeNode {
  return {
    id,
    parentId: null,
    name,
    kind: 'DEPARTMENT',
    depth: 1,
    sortOrder: 0,
    memberCount: 3,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    children,
    ...(archivedAt ? { archivedAt } : {}),
  };
}

const TREE: OrganizationUnitTreeNode[] = [
  buildNode('root-1', 'Direktorat Medis', [
    buildNode('child-1', 'Rawat Jalan', [buildNode('grandchild-1', 'Poli Umum')]),
    buildNode('child-2', 'Poli Kulit', [], '2026-09-08T00:00:00.000Z'),
  ]),
  buildNode('root-2', 'Cabang Bekasi'),
];

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('OrganizationChartView', () => {
  it('renders the whole tree at once, deeper levels included', () => {
    // Unlike the list view, the diagram has no collapse: the point of the
    // picture is seeing all of it.
    render(<OrganizationChartView roots={TREE} isError={false} onSelectUnit={vi.fn()} />);

    expect(screen.getByText('Direktorat Medis')).toBeInTheDocument();
    expect(screen.getByText('Poli Umum')).toBeInTheDocument();
    expect(screen.getByText('Cabang Bekasi')).toBeInTheDocument();
  });

  it('nests children inside their parent list item', () => {
    render(<OrganizationChartView roots={TREE} isError={false} onSelectUnit={vi.fn()} />);

    const rootItem = screen.getByText('Direktorat Medis').closest('li') as HTMLElement;
    // The grandchild renders inside the root's subtree, which is what makes the
    // connector lines mean what they appear to mean.
    expect(within(rootItem).getByText('Poli Umum')).toBeInTheDocument();
    const bekasiItem = screen.getByText('Cabang Bekasi').closest('li') as HTMLElement;
    expect(within(bekasiItem).queryByText('Poli Umum')).not.toBeInTheDocument();
  });

  it('shows kind and member count on every card', () => {
    render(<OrganizationChartView roots={TREE} isError={false} onSelectUnit={vi.fn()} />);

    const card = screen.getByRole('button', { name: /Cabang Bekasi/ });
    expect(within(card).getByText('Department')).toBeInTheDocument();
    expect(within(card).getByText('3')).toBeInTheDocument();
  });

  it('marks an archived unit without hiding it', () => {
    render(<OrganizationChartView roots={TREE} isError={false} onSelectUnit={vi.fn()} />);

    const archivedCard = screen.getByRole('button', { name: /Poli Kulit/ });
    expect(within(archivedCard).getByText('Archived')).toBeInTheDocument();
  });

  it('opens the members dialog path when a card is clicked', async () => {
    // The diagram's one action: the natural question when looking at a box is
    // "who is in it". Every edit stays in the list view.
    const user = userEvent.setup();
    const onSelectUnit = vi.fn();
    render(<OrganizationChartView roots={TREE} isError={false} onSelectUnit={onSelectUnit} />);

    await user.click(screen.getByRole('button', { name: /Rawat Jalan/ }));

    expect(onSelectUnit).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }));
  });

  it('falls back to the empty state for an empty forest', () => {
    render(<OrganizationChartView roots={[]} isError={false} onSelectUnit={vi.fn()} />);

    expect(screen.getByText('No organization units yet')).toBeInTheDocument();
  });
});
