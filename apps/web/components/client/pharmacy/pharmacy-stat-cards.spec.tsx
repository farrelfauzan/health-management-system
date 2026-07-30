import type { ReactNode } from 'react';
import { render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { PharmacyStatCards } from './pharmacy-stat-cards';
import { LOW_STOCK_THRESHOLD } from '#lib/pharmacy/low-stock';
import { MOCK_INVENTORY_STATS } from '#lib/pharmacy/mock-inventory-stats';
import messages from '../../../messages/en/operations.json';

function render(node: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

type StatCardsProps = Parameters<typeof PharmacyStatCards>[0];

function buildStatCardsProps(overrides: Partial<StatCardsProps>): StatCardsProps {
  return {
    pendingTotal: 42,
    isPendingLoading: false,
    isPendingError: false,
    lowStockCount: 8,
    medicationsTotal: 40,
    isStockLoading: false,
    isStockError: false,
    onViewFullQueue: vi.fn(),
    ...overrides,
  };
}

describe('PharmacyStatCards', () => {
  it('renders real pending and low-stock stats alongside the mock inventory cards', () => {
    render(<PharmacyStatCards {...buildStatCardsProps({})} />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8 medications')).toBeInTheDocument();
    expect(
      screen.getByText(`At or below ${LOW_STOCK_THRESHOLD} units in stock`),
    ).toBeInTheDocument();
    expect(screen.getByText(MOCK_INVENTORY_STATS.totalInventoryValue)).toBeInTheDocument();
    expect(screen.getByText(`${MOCK_INVENTORY_STATS.expiringSoonCount} items`)).toBeInTheDocument();
  });

  it('renders skeletons while the backend stats are loading', () => {
    render(
      <PharmacyStatCards
        {...buildStatCardsProps({ isPendingLoading: true, isStockLoading: true })}
      />,
    );

    expect(screen.getByTestId('stat-skeleton-pending-orders')).toBeInTheDocument();
    expect(screen.getByTestId('stat-skeleton-low-stock')).toBeInTheDocument();
  });

  it('renders fallback values when a backend stat fails', () => {
    render(
      <PharmacyStatCards {...buildStatCardsProps({ isPendingError: true, isStockError: true })} />,
    );

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByText('Unable to load')).toHaveLength(2);
  });

  it('invokes the queue shortcut from the pending orders card', async () => {
    const user = userEvent.setup();
    const onViewFullQueue = vi.fn();
    render(<PharmacyStatCards {...buildStatCardsProps({ onViewFullQueue })} />);

    await user.click(screen.getByRole('button', { name: 'View Full Queue' }));

    expect(onViewFullQueue).toHaveBeenCalledTimes(1);
  });
});
