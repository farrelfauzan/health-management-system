import { RoomInventoryListMeta, RoomResponse, UpdateRoomRecordPayload } from '@hms/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CreateRoomDto } from '../dto/create-room.dto';
import { ListRoomsQueryDto } from '../dto/list-rooms-query.dto';
import { UpdateRoomDto } from '../dto/update-room.dto';
import { InventoryCodeConflictError } from '../repository/inventory-code-conflict.error';
import { RoomClassRepository } from '../repository/room-class.repository';
import { RoomRepository } from '../repository/room.repository';
import { WardRepository } from '../repository/ward.repository';
import { RoomInventoryMapper } from './room-inventory.mapper';

@Injectable()
export class RoomService {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly wardRepository: WardRepository,
    private readonly roomClassRepository: RoomClassRepository,
    private readonly roomInventoryMapper: RoomInventoryMapper,
  ) {}

  async listRooms(query: ListRoomsQueryDto): Promise<{
    items: RoomResponse[];
    meta: RoomInventoryListMeta;
  }> {
    const result = await this.roomRepository.listRooms({
      page: query.page,
      limit: query.limit,
      wardId: query.wardId,
      roomClassId: query.roomClassId,
      search: query.search,
      isActive: query.isActive,
    });

    return {
      items: result.items.map((room) => this.roomInventoryMapper.toRoomResponse(room)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getRoom(id: string): Promise<RoomResponse> {
    const room = await this.roomRepository.findRoomById(id);

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return this.roomInventoryMapper.toRoomResponse(room);
  }

  async createRoom(payload: CreateRoomDto): Promise<RoomResponse> {
    // Checked here rather than left to the foreign key so a retired ward is
    // refused too: the FK would happily accept a soft-deleted parent and hide
    // the new room from every list that filters on `deletedAt`.
    const ward = await this.wardRepository.findWardById(payload.wardId);

    if (!ward) {
      throw new BadRequestException('Ward not found');
    }

    await this.assertRoomClassIsLive(payload.roomClassId);

    try {
      const created = await this.roomRepository.createRoom({
        wardId: payload.wardId,
        code: payload.code,
        name: payload.name,
        roomClassId: payload.roomClassId,
        description: payload.description,
        isActive: payload.isActive,
      });
      return this.roomInventoryMapper.toRoomResponse(created);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  /**
   * `roomClassId` is updatable, and that is a pricing decision as much as an
   * inventory one: IMP-15 bills each night at the class the assignment was in,
   * so re-classing a room changes what tonight costs and leaves every night
   * already billed alone.
   */
  async updateRoom(id: string, payload: UpdateRoomDto): Promise<RoomResponse> {
    await this.getRoom(id);

    if (payload.roomClassId !== undefined) {
      await this.assertRoomClassIsLive(payload.roomClassId);
    }

    const updated = await this.roomRepository.updateRoom(this.buildUpdatePayload(id, payload));

    return this.roomInventoryMapper.toRoomResponse(updated);
  }

  async retireRoom(id: string): Promise<void> {
    await this.getRoom(id);
    const liveBeds = await this.roomRepository.countLiveBeds(id);

    if (liveBeds > 0) {
      throw new ConflictException('Room still has beds; retire or move them first');
    }

    await this.roomRepository.softDeleteRoom(id);
  }

  /**
   * Checked here rather than left to the foreign key so a *retired* class is
   * refused too: the FK would happily accept a soft-deleted row and leave a
   * room pointing at a class that no list returns.
   */
  private async assertRoomClassIsLive(roomClassId: string): Promise<void> {
    const roomClass = await this.roomClassRepository.findRoomClassById(roomClassId);

    if (!roomClass) {
      throw new BadRequestException('Room class not found');
    }
  }

  private buildUpdatePayload(id: string, payload: UpdateRoomDto): UpdateRoomRecordPayload {
    return {
      id,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.roomClassId !== undefined ? { roomClassId: payload.roomClassId } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof InventoryCodeConflictError) {
      return new ConflictException(err.message);
    }
    return err;
  }
}
