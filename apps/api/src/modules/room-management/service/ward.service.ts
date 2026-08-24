import { RoomInventoryListMeta, UpdateWardRecordPayload, WardResponse } from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CreateWardDto } from '../dto/create-ward.dto';
import { ListWardsQueryDto } from '../dto/list-wards-query.dto';
import { UpdateWardDto } from '../dto/update-ward.dto';
import { InventoryCodeConflictError } from '../repository/inventory-code-conflict.error';
import { WardRepository } from '../repository/ward.repository';
import { RoomInventoryMapper } from './room-inventory.mapper';

/**
 * Wards (bangsal) are master data: retired, never deleted, because discharged
 * admissions keep pointing at the beds they used.
 */
@Injectable()
export class WardService {
  constructor(
    private readonly wardRepository: WardRepository,
    private readonly roomInventoryMapper: RoomInventoryMapper,
  ) {}

  async listWards(query: ListWardsQueryDto): Promise<{
    items: WardResponse[];
    meta: RoomInventoryListMeta;
  }> {
    const result = await this.wardRepository.listWards({
      page: query.page,
      limit: query.limit,
      search: query.search,
      isActive: query.isActive,
    });

    return {
      items: result.items.map((ward) => this.roomInventoryMapper.toWardResponse(ward)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getWard(id: string): Promise<WardResponse> {
    const ward = await this.wardRepository.findWardById(id);

    if (!ward) {
      throw new NotFoundException('Ward not found');
    }

    return this.roomInventoryMapper.toWardResponse(ward);
  }

  async createWard(payload: CreateWardDto): Promise<WardResponse> {
    try {
      const created = await this.wardRepository.createWard({
        code: payload.code,
        name: payload.name,
        description: payload.description,
        isActive: payload.isActive,
      });
      return this.roomInventoryMapper.toWardResponse(created);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async updateWard(id: string, payload: UpdateWardDto): Promise<WardResponse> {
    await this.getWard(id);
    const updated = await this.wardRepository.updateWard(this.buildUpdatePayload(id, payload));

    return this.roomInventoryMapper.toWardResponse(updated);
  }

  /**
   * Retiring a ward that still holds rooms is refused rather than cascaded.
   * A cascade would silently retire beds a patient may be lying in, and the
   * caller who meant it can empty the ward first — which is the same order the
   * floor plan changes in real life.
   */
  async retireWard(id: string): Promise<void> {
    await this.getWard(id);
    const liveRooms = await this.wardRepository.countLiveRooms(id);

    if (liveRooms > 0) {
      throw new ConflictException('Ward still has rooms; retire or move them first');
    }

    await this.wardRepository.softDeleteWard(id);
  }

  private buildUpdatePayload(id: string, payload: UpdateWardDto): UpdateWardRecordPayload {
    return {
      id,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
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
