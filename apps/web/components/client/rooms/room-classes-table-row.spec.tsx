import type { RoomClassResponse } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { RoomClassesTableRow } from './room-classes-table-row';
import operations from '../../../messages/en/operations.json';
import shared from '../../../messages/en/shared.json';

const messages = { ...operations, ...shared };

function buildRoomClass(overrides: Partial<RoomClassResponse> = {}): RoomClassResponse {
  return {
    id: 'class-1',
    code: 'KELAS_1',
    name: 'Kelas 1',
    description: 'Kelas perawatan 1',
    allocatedBeds: 0,
    isActive: true,
    createdAt: '2026-09-05T02:00:00.000Z',
    updatedAt: '2026-09-05T02:00:00.000Z',
    ...overrides,
  };
}

function renderRow(roomClass: RoomClassResponse, onRetire = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <RoomClassesTableRow
            roomClass={roomClass}
            canUpdate
            canDelete
            onEdit={vi.fn()}
            onRetire={onRetire}
          />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('RoomClassesTableRow', () => {
  it('reads a quota as allocation against ceiling', () => {
    renderRow(buildRoomClass({ quota: 12, allocatedBeds: 9 }));

    expect(screen.getByText('9 of 12 beds')).toBeInTheDocument();
  });

  it('says uncapped rather than showing a zero', () => {
    // A class with no quota has no ceiling — rendering "0" would read as
    // "no beds allowed", which is the opposite of what it means.
    renderRow(buildRoomClass({ allocatedBeds: 4 }));

    expect(screen.getByText('Uncapped')).toBeInTheDocument();
  });

  it('locks retire while the class still holds beds', async () => {
    // The API answers 409 while rooms carry the class. Disabling the item says
    // so before the click rather than after it.
    const user = userEvent.setup();
    renderRow(buildRoomClass({ allocatedBeds: 3 }));

    await user.click(screen.getByRole('button', { name: /Actions for Kelas 1/ }));

    expect(screen.getByRole('menuitem', { name: 'Retire' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
