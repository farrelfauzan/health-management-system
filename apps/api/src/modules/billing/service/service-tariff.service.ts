import {
  ServiceTariffResponse,
  ServiceTariffsListMeta,
  UpdateServiceTariffRecordPayload,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

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
    try {
      const created = await this.serviceTariffRepository.createServiceTariff({
        code: payload.code,
        name: payload.name,
        category: payload.category,
        icd9cmCode: payload.icd9cmCode,
        roomClassId: payload.roomClassId,
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
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof TariffIdentifierConflictError) {
      return new ConflictException(err.message);
    }
    return err;
  }
}
