import {
  BedRecord,
  BedResponse,
  RoomClassRecord,
  RoomClassResponse,
  RoomRecord,
  RoomResponse,
  WardRecord,
  WardResponse,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

/**
 * Record → response translation for the inventory tree. One place, because
 * three services and the occupancy board all render the same three shapes and
 * a second copy is how a field starts meaning two things.
 */
@Injectable()
export class RoomInventoryMapper {
  /**
   * `allocatedBeds` is passed in rather than read here: it is a count across
   * two other tables, and a mapper that queried would make rendering a list of
   * ten classes ten round trips.
   */
  toRoomClassResponse(roomClass: RoomClassRecord, allocatedBeds: number): RoomClassResponse {
    return {
      id: roomClass.id,
      code: roomClass.code,
      name: roomClass.name,
      description: roomClass.description ?? undefined,
      quota: roomClass.quota ?? undefined,
      allocatedBeds,
      isActive: roomClass.isActive,
      createdAt: roomClass.createdAt.toISOString(),
      updatedAt: roomClass.updatedAt.toISOString(),
    };
  }

  toWardResponse(ward: WardRecord): WardResponse {
    return {
      id: ward.id,
      code: ward.code,
      name: ward.name,
      description: ward.description ?? undefined,
      isActive: ward.isActive,
      createdAt: ward.createdAt.toISOString(),
      updatedAt: ward.updatedAt.toISOString(),
    };
  }

  toRoomResponse(room: RoomRecord): RoomResponse {
    return {
      id: room.id,
      wardId: room.wardId,
      ward: {
        id: room.wardId,
        code: room.wardCode,
        name: room.wardName,
      },
      roomClassId: room.roomClass.id,
      roomClass: room.roomClass,
      code: room.code,
      name: room.name,
      description: room.description ?? undefined,
      isActive: room.isActive,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  toBedResponse(bed: BedRecord): BedResponse {
    return {
      id: bed.id,
      roomId: bed.roomId,
      room: {
        id: bed.roomId,
        code: bed.roomCode,
        name: bed.roomName,
        roomClass: bed.roomClass,
      },
      ward: {
        id: bed.wardId,
        code: bed.wardCode,
        name: bed.wardName,
      },
      code: bed.code,
      status: bed.status,
      notes: bed.notes ?? undefined,
      createdAt: bed.createdAt.toISOString(),
      updatedAt: bed.updatedAt.toISOString(),
    };
  }
}
