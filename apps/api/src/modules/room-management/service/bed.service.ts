import { BedResponse, RoomInventoryListMeta, UpdateBedRecordPayload } from '@hms/shared-types';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CreateBedDto } from '../dto/create-bed.dto';
import { ListBedsQueryDto } from '../dto/list-beds-query.dto';
import { UpdateBedDto } from '../dto/update-bed.dto';
import { BedRepository } from '../repository/bed.repository';
import { InventoryCodeConflictError } from '../repository/inventory-code-conflict.error';
import { RoomRepository } from '../repository/room.repository';
import { RoomClassService } from './room-class.service';
import { RoomInventoryMapper } from './room-inventory.mapper';

@Injectable()
export class BedService {
  constructor(
    private readonly bedRepository: BedRepository,
    private readonly roomRepository: RoomRepository,
    private readonly roomClassService: RoomClassService,
    private readonly roomInventoryMapper: RoomInventoryMapper,
  ) {}

  async listBeds(query: ListBedsQueryDto): Promise<{
    items: BedResponse[];
    meta: RoomInventoryListMeta;
  }> {
    const result = await this.bedRepository.listBeds({
      page: query.page,
      limit: query.limit,
      wardId: query.wardId,
      roomId: query.roomId,
      status: query.status,
      search: query.search,
    });

    return {
      items: result.items.map((bed) => this.roomInventoryMapper.toBedResponse(bed)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getBed(id: string): Promise<BedResponse> {
    const bed = await this.bedRepository.findBedById(id);

    if (!bed) {
      throw new NotFoundException('Bed not found');
    }

    return this.roomInventoryMapper.toBedResponse(bed);
  }

  async createBed(payload: CreateBedDto): Promise<BedResponse> {
    const room = await this.roomRepository.findRoomById(payload.roomId);

    if (!room) {
      throw new BadRequestException('Room not found');
    }

    // A class quota is a plan the clinic revises, so it is checked here rather
    // than by a CHECK constraint — a database rule would make raising a ceiling
    // a migration. Refused rather than warned: a quota nothing enforces is
    // decoration, and the class screen shows the count before anyone gets here.
    await this.roomClassService.assertQuotaAllowsAnotherBed(room.roomClass.id);

    try {
      const created = await this.bedRepository.createBed({
        roomId: payload.roomId,
        code: payload.code,
        status: payload.status,
        notes: payload.notes,
      });
      return this.roomInventoryMapper.toBedResponse(created);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  /**
   * An inventory edit may move a bed between AVAILABLE and MAINTENANCE and
   * nothing else — `settableBedStatusSchema` has no OCCUPIED value. OCCUPIED
   * is written only by the admit/transfer/discharge transactions (IMP-14),
   * because a bed being free is a claim about a patient, not about the
   * furniture.
   */
  async updateBed(id: string, payload: UpdateBedDto): Promise<BedResponse> {
    const existing = await this.bedRepository.findBedById(id);

    if (!existing) {
      throw new NotFoundException('Bed not found');
    }

    if (payload.status !== undefined && existing.status === 'OCCUPIED') {
      throw new ConflictException('Bed is occupied; discharge or transfer the patient first');
    }

    const updated = await this.bedRepository.updateBed(this.buildUpdatePayload(id, payload));

    return this.roomInventoryMapper.toBedResponse(updated);
  }

  async retireBed(id: string): Promise<void> {
    await this.getBed(id);
    // Asks the assignment table, not `status`: the open assignment is the
    // fact and `status` is only its projection.
    const isOccupied = await this.bedRepository.hasOpenAssignment(id);

    if (isOccupied) {
      throw new ConflictException('Bed is occupied; discharge or transfer the patient first');
    }

    await this.bedRepository.softDeleteBed(id);
  }

  private buildUpdatePayload(id: string, payload: UpdateBedDto): UpdateBedRecordPayload {
    return {
      id,
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof InventoryCodeConflictError) {
      return new ConflictException(err.message);
    }
    return err;
  }
}
