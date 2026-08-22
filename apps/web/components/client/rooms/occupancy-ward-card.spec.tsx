import type { WardOccupancyResponse } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { OccupancyWardCard } from './occupancy-ward-card';
import operations from '../../../messages/en/operations.json';

function renderCard(ward: WardOccupancyResponse) {
  render(
    <NextIntlClientProvider locale="en" messages={operations} timeZone="Asia/Jakarta">
      <OccupancyWardCard ward={ward} />
    </NextIntlClientProvider>,
  );
}

describe('OccupancyWardCard', () => {
  it('shows the ward totals alongside its rooms', () => {
    renderCard({
      wardId: 'ward-1',
      code: 'MELATI',
      name: 'Bangsal Melati',
      totalBeds: 4,
      availableBeds: 2,
      occupiedBeds: 1,
      maintenanceBeds: 1,
      rooms: [
        {
          roomId: 'room-1',
          code: '201',
          name: 'Kamar 201',
          roomClass: { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' },
          totalBeds: 4,
          availableBeds: 2,
          occupiedBeds: 1,
          maintenanceBeds: 1,
        },
      ],
    });

    expect(screen.getByText('Bangsal Melati')).toBeInTheDocument();
    expect(screen.getByText('Kamar 201')).toBeInTheDocument();
    expect(screen.getByText('Kelas 1')).toBeInTheDocument();
  });

  it('draws a ward with no rooms rather than dropping it', () => {
    // The API returns the empty ward deliberately: someone opening the board
    // to find a bed needs to see it, and omitting it reads as "no such ward".
    renderCard({
      wardId: 'ward-2',
      code: 'ANGGREK',
      name: 'Bangsal Anggrek',
      totalBeds: 0,
      availableBeds: 0,
      occupiedBeds: 0,
      maintenanceBeds: 0,
      rooms: [],
    });

    expect(screen.getByText('Bangsal Anggrek')).toBeInTheDocument();
    expect(screen.getByText('No rooms in this ward yet.')).toBeInTheDocument();
  });
});
