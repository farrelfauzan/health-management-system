import { SatusehatLocationSourceRecords, SatusehatLocationTreeEntry } from '@hms/shared-types';

type RoomSource = SatusehatLocationSourceRecords['rooms'][number];

/**
 * The clinic's Location tree, flat and parents first (P24-T06, FR-LOC-03/04).
 *
 * Order is site, polis by name, then each ward by code followed by its rooms
 * and each room's beds. Registration walks the list in this order, which is
 * what guarantees a parent is registered before any `partOf` names it. A room
 * whose ward is not in the tree still appears, after the wards, so it shows as
 * blocked rather than silently missing.
 *
 * `rootLocationId` is the site's id as FR-LOC-02 resolves it: the registered
 * column, else the deployment's `SATUSEHAT_LOCATION_ID`.
 */
export function buildSatusehatLocationTree(
  sources: SatusehatLocationSourceRecords,
  rootLocationId: string | null,
): SatusehatLocationTreeEntry[] {
  const siteId = sources.clinic?.id ?? null;
  const site: SatusehatLocationTreeEntry[] =
    sources.clinic === null
      ? []
      : [
          {
            kind: 'SITE',
            id: sources.clinic.id,
            parentId: null,
            depth: 0,
            name: sources.clinic.name,
            code: null,
            isActive: true,
            satusehatLocationId: rootLocationId,
            roomClass: null,
          },
        ];
  const specialties = [...sources.specialties]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (specialty): SatusehatLocationTreeEntry => ({
        kind: 'SPECIALTY',
        id: specialty.id,
        parentId: siteId,
        depth: 1,
        name: specialty.name,
        code: null,
        isActive: specialty.isActive && !specialty.isDeleted,
        satusehatLocationId: specialty.satusehatLocationId,
        roomClass: null,
      }),
    );
  const wardIds = new Set(sources.wards.map((ward) => ward.id));
  const wardBranches = [...sources.wards]
    .sort((left, right) => left.code.localeCompare(right.code))
    .flatMap((ward) => [
      {
        kind: 'WARD' as const,
        id: ward.id,
        parentId: siteId,
        depth: 1,
        name: ward.name,
        code: ward.code,
        isActive: ward.isActive && !ward.isDeleted,
        satusehatLocationId: ward.satusehatLocationId,
        roomClass: null,
      },
      ...buildRoomBranches(sources, sources.rooms.filter((room) => room.wardId === ward.id)),
    ]);
  const orphanRooms = buildRoomBranches(
    sources,
    sources.rooms.filter((room) => !wardIds.has(room.wardId)),
  );
  return [...site, ...specialties, ...wardBranches, ...orphanRooms];
}

function buildRoomBranches(
  sources: SatusehatLocationSourceRecords,
  rooms: RoomSource[],
): SatusehatLocationTreeEntry[] {
  return [...rooms]
    .sort((left, right) => left.code.localeCompare(right.code))
    .flatMap((room) => [
      {
        kind: 'ROOM' as const,
        id: room.id,
        parentId: room.wardId,
        depth: 2,
        name: room.name,
        code: room.code,
        isActive: room.isActive && !room.isDeleted,
        satusehatLocationId: room.satusehatLocationId,
        roomClass: room.roomClass,
      },
      ...sources.beds
        .filter((bed) => bed.roomId === room.id)
        .sort((left, right) => left.code.localeCompare(right.code))
        .map(
          (bed): SatusehatLocationTreeEntry => ({
            kind: 'BED',
            id: bed.id,
            parentId: room.id,
            depth: 3,
            name: `${room.name} · ${bed.code}`,
            code: bed.code,
            isActive: !bed.isDeleted,
            satusehatLocationId: bed.satusehatLocationId,
            roomClass: room.roomClass,
          }),
        ),
    ]);
}
