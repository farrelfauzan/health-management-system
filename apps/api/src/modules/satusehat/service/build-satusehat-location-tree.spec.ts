import { SatusehatLocationSourceRecords } from '@hms/shared-types';

import { buildSatusehatLocationTree } from './build-satusehat-location-tree';

describe('buildSatusehatLocationTree', () => {
  const inputSources: SatusehatLocationSourceRecords = {
    clinic: { id: 'clinic', name: 'Klinik', latitude: -6.1, longitude: 106.8, satusehatLocationId: null },
    specialties: [
      { id: 'umum', name: 'Poli Umum', isActive: true, isDeleted: false, satusehatLocationId: null },
      { id: 'kia', name: 'Poli KIA', isActive: true, isDeleted: false, satusehatLocationId: null },
    ],
    wards: [{ id: 'melati', code: 'MEL', name: 'Bangsal Melati', isActive: true, isDeleted: false, satusehatLocationId: null }],
    rooms: [
      {
        id: 'room-2',
        wardId: 'melati',
        code: 'MEL-02',
        name: 'Kamar 2',
        isActive: true,
        isDeleted: false,
        satusehatLocationId: null,
        roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' },
      },
      {
        id: 'room-1',
        wardId: 'melati',
        code: 'MEL-01',
        name: 'Kamar 1',
        isActive: true,
        isDeleted: false,
        satusehatLocationId: null,
        roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' },
      },
    ],
    beds: [
      { id: 'bed-2', roomId: 'room-1', code: 'B2', isDeleted: false, satusehatLocationId: null },
      { id: 'bed-1', roomId: 'room-1', code: 'B1', isDeleted: false, satusehatLocationId: null },
    ],
  };

  it('orders root → polis → ward → room → bed, parents first', () => {
    const actualEntries = buildSatusehatLocationTree(inputSources, null);

    expect(actualEntries.map((entry) => entry.id)).toEqual([
      'clinic',
      'kia',
      'umum',
      'melati',
      'room-1',
      'bed-1',
      'bed-2',
      'room-2',
    ]);
    expect(actualEntries.map((entry) => entry.depth)).toEqual([0, 1, 1, 1, 2, 3, 3, 2]);
  });

  it('gives beds their room class and the site the resolved root id', () => {
    const actualEntries = buildSatusehatLocationTree(inputSources, 'env-root');

    expect(actualEntries[0]?.satusehatLocationId).toBe('env-root');
    expect(actualEntries.find((entry) => entry.id === 'bed-1')?.roomClass?.satusehatServiceClass).toBe('CLASS_2');
  });

  it('keeps a room whose ward is not in the tree, pointing at the missing ward', () => {
    const actualEntries = buildSatusehatLocationTree({ ...inputSources, wards: [] }, null);

    expect(actualEntries.find((entry) => entry.id === 'room-1')?.parentId).toBe('melati');
  });

  it('marks a soft-deleted registered bed inactive so the push says so (FR-LOC-08)', () => {
    const actualEntries = buildSatusehatLocationTree(
      {
        ...inputSources,
        beds: [{ id: 'bed-1', roomId: 'room-1', code: 'B1', isDeleted: true, satusehatLocationId: 'ihs-bed' }],
      },
      null,
    );

    expect(actualEntries.find((entry) => entry.id === 'bed-1')?.isActive).toBe(false);
  });
});
