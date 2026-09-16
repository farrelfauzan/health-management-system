import {
  ServiceTariffAudienceState,
  ServiceTariffRecord,
  ServiceTariffResponse,
  ServiceTariffsListMeta,
  UpdateServiceTariffRecordPayload,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateServiceTariffDto } from '../dto/create-service-tariff.dto';
import { ListServiceTariffsQueryDto } from '../dto/list-service-tariffs-query.dto';
import { UpdateServiceTariffDto } from '../dto/update-service-tariff.dto';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';
import { TariffIdentifierConflictError } from '../repository/tariff-identifier-conflict.error';
import { BillingMapper } from './billing.mapper';

/**
 * The price list behind invoice generation. Tariffs are reference data:
 * deactivated when retired, never deleted, because invoice items keep them as
 * provenance.
 */
@Injectable()
export class ServiceTariffService {
  constructor(
    private readonly serviceTariffRepository: ServiceTariffRepository,
    private readonly billingMapper: BillingMapper,
  ) {}

  async listServiceTariffs(query: ListServiceTariffsQueryDto): Promise<{
    items: ServiceTariffResponse[];
    meta: ServiceTariffsListMeta;
  }> {
    const result = await this.serviceTariffRepository.listServiceTariffs({
      page: query.page,
      limit: query.limit,
      category: query.category,
      isActive: query.isActive,
      search: query.search,
    });

    return {
      items: result.items.map((tariff) => this.billingMapper.toServiceTariffResponse(tariff)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async createServiceTariff(payload: CreateServiceTariffDto): Promise<ServiceTariffResponse> {
    await this.assertFallbackConsultationIsFree({
      category: payload.category,
      specialtyId: payload.specialtyId,
      profession: payload.profession,
      isActive: payload.isActive,
    });
    try {
      const created = await this.serviceTariffRepository.createServiceTariff({
        code: payload.code,
        name: payload.name,
        category: payload.category,
        icd9cmCode: payload.icd9cmCode,
        roomClassId: payload.roomClassId,
        specialtyId: payload.specialtyId,
        profession: payload.profession,
        price: payload.price,
        isActive: payload.isActive,
      });
      return this.billingMapper.toServiceTariffResponse(created);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async updateServiceTariff(
    id: string,
    payload: UpdateServiceTariffDto,
  ): Promise<ServiceTariffResponse> {
    const existing = await this.serviceTariffRepository.findServiceTariffById(id);

    if (!existing) {
      throw new NotFoundException('Service tariff not found');
    }
    const merged = this.mergeAudience(existing, payload);
    this.assertAudienceMatchesCategory(merged);
    await this.assertFallbackConsultationIsFree(merged, id);

    try {
      const updated = await this.serviceTariffRepository.updateServiceTariff(
        this.buildUpdatePayload(id, payload),
      );
      return this.billingMapper.toServiceTariffResponse(updated);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  private buildUpdatePayload(
    id: string,
    payload: UpdateServiceTariffDto,
  ): UpdateServiceTariffRecordPayload {
    return {
      id,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {}),
      ...(payload.icd9cmCode !== undefined ? { icd9cmCode: payload.icd9cmCode } : {}),
      ...(payload.roomClassId !== undefined ? { roomClassId: payload.roomClassId } : {}),
      ...(payload.specialtyId !== undefined ? { specialtyId: payload.specialtyId } : {}),
      ...(payload.profession !== undefined ? { profession: payload.profession } : {}),
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    };
  }

  /**
   * What the row will look like once the patch lands. An update that leaves a
   * field alone keeps the stored one, which is the only way to tell an
   * audience being cleared (`null`) from one being left untouched.
   */
  private mergeAudience(
    existing: ServiceTariffRecord,
    payload: UpdateServiceTariffDto,
  ): ServiceTariffAudienceState {
    return {
      category: payload.category ?? existing.category,
      specialtyId:
        payload.specialtyId === undefined
          ? (existing.specialtyId ?? undefined)
          : (payload.specialtyId ?? undefined),
      profession:
        payload.profession === undefined
          ? (existing.profession ?? undefined)
          : (payload.profession ?? undefined),
      isActive: payload.isActive ?? existing.isActive,
    };
  }

  /**
   * The schema cannot run this check alone: an update that sets a poli without
   * restating the category has nothing to compare it against until the stored
   * row is read.
   */
  private assertAudienceMatchesCategory(merged: ServiceTariffAudienceState): void {
    const namesAudience = merged.specialtyId !== undefined || merged.profession !== undefined;
    if (namesAudience && merged.category !== 'CONSULTATION') {
      throw new BadRequestException(
        'Only CONSULTATION tariffs name a poli or profession; clear them before changing category',
      );
    }
  }

  /**
   * The clinic-wide consultation fee — the row naming neither poli nor
   * profession — must be unique among active tariffs, or generation has two
   * equally good answers for every visit no poli-specific price claims. The
   * database enforces the same rule for rows that *do* name an audience; this
   * one cannot be an index, because a partial index over the untagged rows
   * would fail to build on the clinics already carrying several of them.
   */
  private async assertFallbackConsultationIsFree(
    candidate: ServiceTariffAudienceState,
    excludeTariffId?: string,
  ): Promise<void> {
    const isFallback =
      candidate.category === 'CONSULTATION' &&
      candidate.specialtyId === undefined &&
      candidate.profession === undefined;
    if (!isFallback || !candidate.isActive) {
      return;
    }
    const activeTariffs = await this.serviceTariffRepository.findActiveConsultationTariffs();
    const conflicting = activeTariffs.find(
      (tariff) =>
        tariff.id !== excludeTariffId && tariff.specialtyId === null && tariff.profession === null,
    );
    if (conflicting) {
      throw new ConflictException(
        `${conflicting.code} is already the clinic-wide consultation fee; give this tariff a poli or profession instead`,
      );
    }
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof TariffIdentifierConflictError) {
      return new ConflictException(err.message);
    }
    return err;
  }
}
