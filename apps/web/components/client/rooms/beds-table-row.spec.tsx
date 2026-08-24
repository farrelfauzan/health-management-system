import type { BedResponse } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { BedsTableRow } from './beds-table-row';
import operations from '../../../messages/en/operations.json';
import shared from '../../../messages/en/shared.json';

const messages = { ...operations, ...shared };

function buildBed(overrides: Partial<BedResponse> = {}): BedResponse {
  return {
    id: 'bed-1',
    roomId: 'room-1',
    room: { id: 'room-1', code: '201', name: 'Kamar 201', roomClass: { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' } },
    ward: { id: 'ward-1', code: 'MELATI', name: 'Bangsal Melati' },
    code: 'A',
    status: 'AVAILABLE',
    createdAt: '2026-09-05T03:00:00.000Z',
    updatedAt: '2026-09-05T03:00:00.000Z',
    ...overrides,
  };
}

function renderRow(bed: BedResponse) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <BedsTableRow
            bed={bed}
            canUpdate
            canDelete
            onEdit={vi.fn()}
            onRetire={vi.fn()}
          />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('BedsTableRow', () => {
  it('renders the class name the clinic gave it, not a bundled label', () => {
    // The name comes from the master-data row, so a clinic that renames
    // "Kelas 1" sees the new name here without a release.
    renderRow(buildBed());

    expect(screen.getByText('Kelas 1')).toBeInTheDocument();
  });

  it('locks edit and retire while a patient is in the bed', async () => {
    // The API refuses both with a 409. Disabling them says so before the
    // click, which is the difference between a rule and a surprise.
    const user = userEvent.setup();
    renderRow(buildBed({ status: 'OCCUPIED' }));

    await user.click(screen.getByRole('button', { name: /Actions for/ }));

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Retire' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
