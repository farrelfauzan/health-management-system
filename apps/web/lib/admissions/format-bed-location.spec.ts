import { describe, expect, it } from 'vitest';

import { formatBedLocation } from '#lib/admissions/format-bed-location';

describe('formatBedLocation', () => {
  it('reads ward, room, bed — the order a ward round says it in', () => {
    const actual = formatBedLocation({
      id: 'bed-1',
      code: 'A',
      room: { id: 'room-1', code: '201', name: 'Kamar 201', roomClass: { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' } },
      ward: { id: 'ward-1', code: 'MELATI', name: 'Bangsal Melati' },
    });

    expect(actual).toBe('Bangsal Melati / 201 / A');
  });
});
