import {
  RoomClassRecord,
  RoomClassResponse,
  RoomInventoryListMeta,
  UpdateRoomClassRecordPayload,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CreateRoomClassDto } from '../dto/create-room-class.dto';
import { ListRoomClassesQueryDto } from '../dto/list-room-classes-query.dto';
import { UpdateRoomClassDto } from '../dto/update-room-class.dto';
import { InventoryCodeConflictError } from '../repository/inventory-code-conflict.error';
import { RoomClassRepository } from '../repository/room-class.repository';
import { RoomInventoryMapper } from './room-inventory.mapper';

/**
 * Kelas perawatan as master data the clinic owns (IMP-13).
 *
 * It is a table rather than an enum for the same reason `Specialty` is: a
 * clinic with a "Suite" or a "Kelas 3B" would otherwise need a migration and a
 * redeploy to sell a bed it already has. The four classes BPJS recognises are
 * seeded baseline rows, not type values, so they can be renamed and extended
 * from this screen.
 */
@Injectable()
export class RoomClassService {
  constructor(
    private readonly roomClassRepository: RoomClassRepository,
    private readonly roomInventoryMapper: RoomInventoryMapper,
  ) {}

  async listRoomClasses(query: ListRoomClassesQueryDto): Promise<{
    items: RoomClassResponse[];
    meta: RoomInventoryListMeta;
  }> {
    const result = await this.roomClassRepository.listRoomClasses({
      page: query.page,
      limit: query.limit,
      search: query.search,
      isActive: query.isActive,
    });

    return {
      items: await this.withAllocatedBeds(result.items),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getRoomClass(id: string): Promise<RoomClassResponse> {
    const roomClass = await this.getRoomClassOrThrow(id);
    const [withAllocation] = await this.withAllocatedBeds([roomClass]);

    // `withAllocatedBeds` maps one-for-one, so the single element is always
    // present — the fallback exists only because the array index cannot say so.
    return withAllocation ?? this.roomInventoryMapper.toRoomClassResponse(roomClass, 0);
  }

  async createRoomClass(payload: CreateRoomClassDto): Promise<RoomClassResponse> {
    try {
      const created = await this.roomClassRepository.createRoomClass({
        code: payload.code,
        name: payload.name,
        description: payload.description,
        quota: payload.quota,
        isActive: payload.isActive,
      });
      return this.roomInventoryMapper.toRoomClassResponse(created, 0);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  /**
   * Lowering a quota below the beds already allocated is refused rather than
   * accepted and reported. A quota is the number bed creation is checked
   * against, so a clinic that could set it under the current count would have
   * a ceiling that is already breached and a screen that says so forever.
   */
  async updateRoomClass(id: string, payload: UpdateRoomClassDto): Promise<RoomClassResponse> {
    await this.getRoomClassOrThrow(id);

    if (typeof payload.quota === 'number') {
      const allocatedBeds = await this.countAllocatedBeds(id);

      if (payload.quota < allocatedBeds) {
        throw new ConflictException(
          `This class already holds ${allocatedBeds} bed(s); retire some before lowering the quota to ${payload.quota}`,
        );
      }
    }

    const updated = await this.roomClassRepository.updateRoomClass(
      this.buildUpdatePayload(id, payload),
    );

    return this.roomInventoryMapper.toRoomClassResponse(updated, await this.countAllocatedBeds(id));
  }

  async retireRoomClass(id: string): Promise<void> {
    await this.getRoomClassOrThrow(id);
    const liveRooms = await this.roomClassRepository.countLiveRooms(id);

    if (liveRooms > 0) {
      throw new ConflictException('Room class is still in use; re-class or retire its rooms first');
    }

    await this.roomClassRepository.softDeleteRoomClass(id);
  }

  /**
   * Whether one more bed fits under this class's quota. Read by
   * {@link BedService} before a create, and deliberately not a database
   * constraint: a quota is a plan the clinic revises, not an invariant of the
   * data, and a CHECK would make raising it a migration.
   */
  async assertQuotaAllowsAnotherBed(roomClassId: string): Promise<void> {
    const roomClass = await this.roomClassRepository.findRoomClassById(roomClassId);

    if (!roomClass || roomClass.quota === null) {
      return;
    }

    const allocatedBeds = await this.countAllocatedBeds(roomClassId);

    if (allocatedBeds >= roomClass.quota) {
      throw new ConflictException(
        `${roomClass.name} is at its quota of ${roomClass.quota} bed(s)`,
      );
    }
  }

  private async countAllocatedBeds(roomClassId: string): Promise<number> {
    const [tally] = await this.roomClassRepository.tallyBedsByRoomClass([roomClassId]);
    return tally?.count ?? 0;
  }

  private async withAllocatedBeds(
    roomClasses: RoomClassRecord[],
  ): Promise<RoomClassResponse[]> {
    const tallies = await this.roomClassRepository.tallyBedsByRoomClass(
      roomClasses.map((roomClass) => roomClass.id),
    );
    const allocatedByClassId = new Map(tallies.map((tally) => [tally.roomClassId, tally.count]));

    return roomClasses.map((roomClass) =>
      this.roomInventoryMapper.toRoomClassResponse(
        roomClass,
        allocatedByClassId.get(roomClass.id) ?? 0,
      ),
    );
  }

  private async getRoomClassOrThrow(id: string): Promise<RoomClassRecord> {
    const roomClass = await this.roomClassRepository.findRoomClassById(id);

    if (!roomClass) {
      throw new NotFoundException('Room class not found');
    }

    return roomClass;
  }

  private buildUpdatePayload(
    id: string,
    payload: UpdateRoomClassDto,
  ): UpdateRoomClassRecordPayload {
    return {
      id,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.quota !== undefined ? { quota: payload.quota } : {}),
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
