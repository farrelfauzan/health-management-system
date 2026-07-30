import { render, screen } from '@testing-library/react';
import { AbilityProvider, buildAppAbility } from '@hms/ui';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/pharmacy-inventory.json';
import { PharmacyWorkspace } from './pharmacy-workspace';

vi.mock('./inventory-panel', () => ({ InventoryPanel: () => <p>Inventory content</p> }));
vi.mock('./pharmacy-panel', () => ({ PharmacyPanel: () => <p>Queue content</p> }));

const initialQuery = { page: 1, limit: 10 };

describe('PharmacyWorkspace', () => {
  it('shows both workspaces when JWT-derived capabilities permit them', () => {
    const ability = buildAppAbility([
      { action: 'read', subject: 'Prescription' },
      { action: 'read', subject: 'Medication' },
      { action: 'read', subject: 'Inventory' },
    ]);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AbilityProvider ability={ability}>
          <PharmacyWorkspace initialQuery={initialQuery} />
        </AbilityProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Prescription Queue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Medication Inventory' })).toBeInTheDocument();
  });

  it('does not expose inventory when only prescription access is granted', () => {
    const ability = buildAppAbility([{ action: 'read', subject: 'Prescription' }]);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AbilityProvider ability={ability}>
          <PharmacyWorkspace initialQuery={initialQuery} />
        </AbilityProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Prescription Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Medication Inventory' })).not.toBeInTheDocument();
  });
});
