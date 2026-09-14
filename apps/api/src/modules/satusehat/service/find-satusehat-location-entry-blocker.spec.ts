import { SatusehatLocationTreeEntry } from '@hms/shared-types';

import { findSatusehatLocationEntryBlocker } from './find-satusehat-location-entry-blocker';

describe('findSatusehatLocationEntryBlocker', () => {
  const inputRoom: SatusehatLocationTreeEntry = {
    kind: 'ROOM',
    id: 'room-1',
    parentId: 'ward-1',
    depth: 2,
    name: 'Kamar 1',
    code: 'K1',
    isActive: true,
    satusehatLocationId: null,
    roomClass: { name: 'Kelas Utama', satusehatServiceClass: null },
  };

  it('names the unmapped room class before the parent', () => {
    const actualBlocker = findSatusehatLocationEntryBlocker({
      entry: inputRoom,
      clinicLatitude: -6.1,
      clinicLongitude: 106.8,
      parent: { name: 'Bangsal', satusehatLocationId: null },
    });

    expect(actualBlocker?.reason).toBe('UNMAPPED_SERVICE_CLASS');
  });

  it('blocks a child of an unregistered parent rather than failing it', () => {
    const actualBlocker = findSatusehatLocationEntryBlocker({
      entry: { ...inputRoom, roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' } },
      clinicLatitude: -6.1,
      clinicLongitude: 106.8,
      parent: { name: 'Bangsal', satusehatLocationId: null },
    });

    expect(actualBlocker).toEqual({ reason: 'UNREGISTERED_PARENT', message: 'Register "Bangsal" first' });
  });

  it('waits for coordinates before anything, the site included', () => {
    const actualBlocker = findSatusehatLocationEntryBlocker({
      entry: { ...inputRoom, kind: 'SITE', parentId: null, roomClass: null },
      clinicLatitude: null,
      clinicLongitude: 106.8,
      parent: null,
    });

    expect(actualBlocker?.reason).toBe('MISSING_COORDINATES');
  });

  it('lets a row with a registered parent through', () => {
    const actualBlocker = findSatusehatLocationEntryBlocker({
      entry: { ...inputRoom, roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' } },
      clinicLatitude: -6.1,
      clinicLongitude: 106.8,
      parent: { name: 'Bangsal', satusehatLocationId: 'ihs-ward' },
    });

    expect(actualBlocker).toBeNull();
  });
});
