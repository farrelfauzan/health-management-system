import { BedStatusTallyRecord, RoomRecord, WardRecord } from '@hms/shared-types';

import { RoomOccupancyRepository } from '../repository/room-occupancy.repository';
import { RoomOccupancyService } from './room-occupancy.service';

/**
 * The integration spec proves the aggregate reads the real ward. This proves
 * the arithmetic on top of it — summing rooms into a ward total, and the two
 * empty cases, which are the ones a query alone never returns a row for.
 */
describe('RoomOccupancyService', () => {
  const WARD_ID = 'ward-1';
  const OTHER_WARD_ID = 'ward-2';

  function buildWard(id: string, code: string): WardRecord {
    return {
      id,
      code,
      name: `Bangsal ${code}`,
      description: null,
      isActive: true,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    };
  }

  const KELAS_1 = { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' };

  function buildRoom(id: string, wardId: string, code: string): RoomRecord {
    return {
      id,
      wardId,
      wardCode: 'MELATI',
      wardName: 'Bangsal Melati',
      code,
      name: `Kamar ${code}`,
      roomClass: KELAS_1,
      description: null,
      isActive: true,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    };
  }

  function buildService(
    wards: WardRecord[],
    rooms: RoomRecord[],
    tallies: BedStatusTallyRecord[],
  ): RoomOccupancyService {
    const mockRepository = {
      listWardsForOccupancy: jest.fn().mockResolvedValue(wards),
      listRoomsForOccupancy: jest.fn().mockResolvedValue(rooms),
      tallyBedStatuses: jest.fn().mockResolvedValue(tallies),
    } as unknown as RoomOccupancyRepository;

    return new RoomOccupancyService(mockRepository);
  }

  it('sums its rooms into the ward total', async () => {
    const service = buildService(
      [buildWard(WARD_ID, 'MELATI')],
      [buildRoom('room-1', WARD_ID, '201'), buildRoom('room-2', WARD_ID, '202')],
      [
        { roomId: 'room-1', status: 'AVAILABLE', count: 2 },
        { roomId: 'room-1', status: 'OCCUPIED', count: 1 },
        { roomId: 'room-2', status: 'MAINTENANCE', count: 3 },
      ],
    );

    const actual = await service.getOccupancy({});

    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      wardId: WARD_ID,
      totalBeds: 6,
      availableBeds: 2,
      occupiedBeds: 1,
      maintenanceBeds: 3,
    });
    expect(actual[0]?.rooms).toHaveLength(2);
  });

  it('keeps a room with no beds, at zero', async () => {
    const service = buildService([buildWard(WARD_ID, 'MELATI')], [buildRoom('room-1', WARD_ID, '201')], []);

    const actual = await service.getOccupancy({});

    expect(actual[0]?.rooms[0]).toMatchObject({
      roomId: 'room-1',
      totalBeds: 0,
      availableBeds: 0,
    });
  });

  it('keeps a ward with no rooms, at zero', async () => {
    // Someone opening the board to find a bed needs to see the empty ward.
    // Dropping it would read as "no such ward" rather than "nothing in it yet".
    const service = buildService([buildWard(WARD_ID, 'MELATI')], [], []);

    const actual = await service.getOccupancy({});

    expect(actual[0]).toMatchObject({ wardId: WARD_ID, totalBeds: 0, rooms: [] });
  });

  it('never counts another ward’s rooms', async () => {
    const service = buildService(
      [buildWard(WARD_ID, 'MELATI'), buildWard(OTHER_WARD_ID, 'ANGGREK')],
      [buildRoom('room-1', WARD_ID, '201'), buildRoom('room-2', OTHER_WARD_ID, '301')],
      [
        { roomId: 'room-1', status: 'AVAILABLE', count: 1 },
        { roomId: 'room-2', status: 'AVAILABLE', count: 5 },
      ],
    );

    const actual = await service.getOccupancy({});

    expect(actual[0]).toMatchObject({ wardId: WARD_ID, totalBeds: 1 });
    expect(actual[1]).toMatchObject({ wardId: OTHER_WARD_ID, totalBeds: 5 });
  });
});
