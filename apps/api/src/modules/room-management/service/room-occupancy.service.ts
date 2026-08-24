import {
  BedStatusTallyRecord,
  RoomOccupancyResponse,
  RoomRecord,
  WardOccupancyResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { RoomOccupancyQueryDto } from '../dto/room-occupancy-query.dto';
import { RoomOccupancyRepository } from '../repository/room-occupancy.repository';

type OccupancyTally = {
  available: number;
  occupied: number;
  maintenance: number;
};

/**
 * The occupancy board: every ward, its rooms, and how many beds in each are
 * free, taken, or out of service.
 *
 * A ward with no rooms and a room with no beds both appear with zeroes rather
 * than being dropped. An empty ward is exactly what someone opening the board
 * to find a bed needs to see — silently omitting it would read as "no such
 * ward" instead of "nothing in it yet".
 */
@Injectable()
export class RoomOccupancyService {
  constructor(private readonly roomOccupancyRepository: RoomOccupancyRepository) {}

  async getOccupancy(query: RoomOccupancyQueryDto): Promise<WardOccupancyResponse[]> {
    const params = { wardId: query.wardId, roomClassId: query.roomClassId };
    const [wards, rooms] = await Promise.all([
      this.roomOccupancyRepository.listWardsForOccupancy(params),
      this.roomOccupancyRepository.listRoomsForOccupancy(params),
    ]);
    const tallies = await this.roomOccupancyRepository.tallyBedStatuses(
      rooms.map((room) => room.id),
    );
    const talliesByRoomId = this.groupTalliesByRoomId(tallies);

    return wards.map((ward) => {
      const wardRooms = rooms.filter((room) => room.wardId === ward.id);
      const roomOccupancies = wardRooms.map((room) =>
        this.toRoomOccupancy(room, talliesByRoomId.get(room.id)),
      );

      return {
        wardId: ward.id,
        code: ward.code,
        name: ward.name,
        totalBeds: this.sumBy(roomOccupancies, (room) => room.totalBeds),
        availableBeds: this.sumBy(roomOccupancies, (room) => room.availableBeds),
        occupiedBeds: this.sumBy(roomOccupancies, (room) => room.occupiedBeds),
        maintenanceBeds: this.sumBy(roomOccupancies, (room) => room.maintenanceBeds),
        rooms: roomOccupancies,
      };
    });
  }

  private groupTalliesByRoomId(tallies: BedStatusTallyRecord[]): Map<string, OccupancyTally> {
    const grouped = new Map<string, OccupancyTally>();

    for (const tally of tallies) {
      const current = grouped.get(tally.roomId) ?? { available: 0, occupied: 0, maintenance: 0 };
      if (tally.status === 'AVAILABLE') {
        current.available += tally.count;
      } else if (tally.status === 'OCCUPIED') {
        current.occupied += tally.count;
      } else {
        current.maintenance += tally.count;
      }
      grouped.set(tally.roomId, current);
    }

    return grouped;
  }

  private toRoomOccupancy(room: RoomRecord, tally?: OccupancyTally): RoomOccupancyResponse {
    const counts = tally ?? { available: 0, occupied: 0, maintenance: 0 };

    return {
      roomId: room.id,
      code: room.code,
      name: room.name,
      roomClass: room.roomClass,
      totalBeds: counts.available + counts.occupied + counts.maintenance,
      availableBeds: counts.available,
      occupiedBeds: counts.occupied,
      maintenanceBeds: counts.maintenance,
    };
  }

  private sumBy(rooms: RoomOccupancyResponse[], pick: (room: RoomOccupancyResponse) => number): number {
    return rooms.reduce((total, room) => total + pick(room), 0);
  }
}
