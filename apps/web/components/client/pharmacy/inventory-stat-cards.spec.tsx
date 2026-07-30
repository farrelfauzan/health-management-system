import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../messages/en/pharmacy-inventory.json';
import { InventoryStatCards } from './inventory-stat-cards';

describe('InventoryStatCards', () => {
  it('renders receipt-derived summary and expiry values', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
        <InventoryStatCards
          summary={{
            asOfDate: '2026-07-30',
            medicationCount: 12,
            totalStockQty: 840,
            reorderCount: 3,
            items: [],
          }}
          expiringCount={4}
          isLoading={false}
          isError={false}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('840')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText(/As of/)).toHaveLength(4);
  });

  it('shows four loading placeholders before either inventory report resolves', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <InventoryStatCards
          summary={undefined}
          expiringCount={undefined}
          isLoading
          isError={false}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByTestId('inventory-stat-skeleton')).toHaveLength(4);
  });
});
