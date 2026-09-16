import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

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
    findActiveConsultationTariffs: jest.fn(),
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
    specialtyId: null,
    specialty: null,
    profession: null,
    price: 50000,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const midwiferySpecialtyId = '2e1b6a3d-4f5c-4d6e-9f70-8b9c0d1e2f30';

  beforeEach(() => {
    jest.clearAllMocks();
    serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
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

  it('refuses a second clinic-wide consultation fee, naming the one that holds it', async () => {
    serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([tariffRecord]);

    await expect(
      service.createServiceTariff({
        code: 'KONSULTASI-LAIN',
        name: 'Konsultasi Lain',
        category: 'CONSULTATION',
        price: 70000,
        isActive: true,
      } as CreateServiceTariffDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(serviceTariffRepositoryMock.createServiceTariff).not.toHaveBeenCalled();
  });

  it('accepts a second consultation tariff once it names a poli', async () => {
    serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([tariffRecord]);
    serviceTariffRepositoryMock.createServiceTariff.mockResolvedValue(tariffRecord);

    await service.createServiceTariff({
      code: 'KONSULTASI-BIDAN',
      name: 'Pemeriksaan Bidan',
      category: 'CONSULTATION',
      specialtyId: midwiferySpecialtyId,
      profession: 'MIDWIFE',
      price: 30000,
      isActive: true,
    } as CreateServiceTariffDto);

    expect(serviceTariffRepositoryMock.createServiceTariff).toHaveBeenCalledWith(
      expect.objectContaining({ specialtyId: midwiferySpecialtyId, profession: 'MIDWIFE' }),
    );
  });

  it('refuses to move a tariff that names a poli out of CONSULTATION', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
      ...tariffRecord,
      specialtyId: midwiferySpecialtyId,
      specialty: { id: midwiferySpecialtyId, name: 'Kebidanan' },
      profession: 'MIDWIFE',
    });

    await expect(
      service.updateServiceTariff(tariffId, { category: 'OTHER' } as UpdateServiceTariffDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceTariffRepositoryMock.updateServiceTariff).not.toHaveBeenCalled();
  });

  it('clears a poli when the update sends null', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
      ...tariffRecord,
      specialtyId: midwiferySpecialtyId,
      specialty: { id: midwiferySpecialtyId, name: 'Kebidanan' },
      profession: 'MIDWIFE',
    });
    serviceTariffRepositoryMock.updateServiceTariff.mockResolvedValue(tariffRecord);

    await service.updateServiceTariff(tariffId, {
      specialtyId: null,
      profession: null,
    } as UpdateServiceTariffDto);

    expect(serviceTariffRepositoryMock.updateServiceTariff).toHaveBeenCalledWith({
      id: tariffId,
      specialtyId: null,
      profession: null,
    });
  });

  it('refuses an ICD-9-CM code on a consultation tariff', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(tariffRecord);

    await expect(
      service.updateServiceTariff(tariffId, { icd9cmCode: '89.07' } as UpdateServiceTariffDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceTariffRepositoryMock.updateServiceTariff).not.toHaveBeenCalled();
  });

  it('refuses to turn a mapped procedure tariff into a consultation without clearing its code', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
      ...tariffRecord,
      category: 'PROCEDURE',
      icd9cmCode: '89.07',
    });

    await expect(
      service.updateServiceTariff(tariffId, {
        category: 'CONSULTATION',
        specialtyId: midwiferySpecialtyId,
      } as UpdateServiceTariffDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceTariffRepositoryMock.updateServiceTariff).not.toHaveBeenCalled();
  });

  it('lets a consultation tariff drop a legacy ICD-9-CM code', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
      ...tariffRecord,
      icd9cmCode: '89.07',
      specialtyId: midwiferySpecialtyId,
      specialty: { id: midwiferySpecialtyId, name: 'Kebidanan' },
    });
    serviceTariffRepositoryMock.updateServiceTariff.mockResolvedValue(tariffRecord);

    await service.updateServiceTariff(tariffId, { icd9cmCode: null } as UpdateServiceTariffDto);

    expect(serviceTariffRepositoryMock.updateServiceTariff).toHaveBeenCalledWith({
      id: tariffId,
      icd9cmCode: null,
    });
  });

  it('returns 404 when updating an unknown tariff', async () => {
    serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(null);

    await expect(
      service.updateServiceTariff(tariffId, { price: 60000 } as UpdateServiceTariffDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(serviceTariffRepositoryMock.updateServiceTariff).not.toHaveBeenCalled();
  });
});
