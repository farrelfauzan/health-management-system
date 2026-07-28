import { ConflictException, NotFoundException } from '@nestjs/common';

import { CreateServiceTariffDto } from '../dto/create-service-tariff.dto';
import { ListServiceTariffsQueryDto } from '../dto/list-service-tariffs-query.dto';
import { UpdateServiceTariffDto } from '../dto/update-service-tariff.dto';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';
import { TariffIdentifierConflictError } from '../repository/tariff-identifier-conflict.error';
import { BillingMapper } from './billing.mapper';
import { ServiceTariffService } from './service-tariff.service';

describe('ServiceTariffService', () => {
  const serviceTariffRepositoryMock = {
    listServiceTariffs: jest.fn(),
    findServiceTariffById: jest.fn(),
    createServiceTariff: jest.fn(),
    updateServiceTariff: jest.fn(),
  };

  const service = new ServiceTariffService(
    serviceTariffRepositoryMock as unknown as ServiceTariffRepository,
    new BillingMapper(),
  );

  const tariffId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const tariffRecord = {
    id: tariffId,
    code: 'KONSULTASI-UMUM',
    name: 'Konsultasi Dokter Umum',
    category: 'CONSULTATION' as const,
    icd9cmCode: null,
    price: 50000,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists tariffs with pagination meta', async () => {
    serviceTariffRepositoryMock.listServiceTariffs.mockResolvedValue({
      items: [tariffRecord],
      page: 1,
      limit: 10,
      total: 1,
    });

    const actualResult = await service.listServiceTariffs({
      page: 1,
      limit: 10,
    } as ListServiceTariffsQueryDto);

    expect(actualResult.items[0]).toEqual(
      expect.objectContaining({ code: 'KONSULTASI-UMUM', price: 50000 }),
    );
    expect(actualResult.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  it('creates a tariff', async () => {
    serviceTariffRepositoryMock.createServiceTariff.mockResolvedValue(tariffRecord);

    const actualResult = await service.createServiceTariff({
      code: 'KONSULTASI-UMUM',
      name: 'Konsultasi Dokter Umum',
      category: 'CONSULTATION',
      price: 50000,
      isActive: true,
    } as CreateServiceTariffDto);

    expect(actualResult.id).toBe(tariffId);
  });

  it('maps a duplicate code to a 409', async () => {
    serviceTariffRepositoryMock.createServiceTariff.mockRejectedValue(
      new TariffIdentifierConflictError('code'),
    );

    await expect(
      service.createServiceTariff({
        code: 'KONSULTASI-UMUM',
        name: 'Konsultasi Dokter Umum',
        category: 'CONSULTATION',
        price: 50000,
        isActive: true,
      } as CreateServiceTariffDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates only the named fields', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(tariffRecord);
    serviceTariffRepositoryMock.updateServiceTariff.mockResolvedValue({
      ...tariffRecord,
      price: 60000,
    });

    const actualResult = await service.updateServiceTariff(tariffId, {
      price: 60000,
    } as UpdateServiceTariffDto);

    expect(serviceTariffRepositoryMock.updateServiceTariff).toHaveBeenCalledWith({
      id: tariffId,
      price: 60000,
    });
    expect(actualResult.price).toBe(60000);
  });

  it('returns 404 when updating an unknown tariff', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(null);

    await expect(
      service.updateServiceTariff(tariffId, { price: 60000 } as UpdateServiceTariffDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(serviceTariffRepositoryMock.updateServiceTariff).not.toHaveBeenCalled();
  });
});
