import { BadRequestException } from '@nestjs/common';

import { RegionsRepository } from '../repository/regions.repository';
import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  const regionsRepositoryMock = {
    listProvinces: jest.fn(),
    listRegencies: jest.fn(),
    listDistricts: jest.fn(),
    listVillages: jest.fn(),
    findChain: jest.fn(),
  };

  const service = new RegionsService(regionsRepositoryMock as unknown as RegionsRepository);

  const inputCodes = {
    provinceCode: '31',
    regencyCode: '31.71',
    districtCode: '31.71.01',
    villageCode: '31.71.01.1001',
  };

  const mockLoadedChain = {
    province: { code: '31', name: 'Daerah Khusus Ibukota Jakarta', parentCode: null },
    regency: { code: '31.71', name: 'Kota Administrasi Jakarta Pusat', parentCode: '31' },
    district: { code: '31.71.01', name: 'Gambir', parentCode: '31.71' },
    village: { code: '31.71.01.1001', name: 'Gambir', parentCode: '31.71.01' },
  };

  function readErrorBody(err: unknown): { message: string; errors: unknown[] } {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).getResponse() as { message: string; errors: unknown[] };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    regionsRepositoryMock.findChain.mockResolvedValue(mockLoadedChain);
  });

  describe('assertAddressChain', () => {
    it('returns the four resolved rows when every level sits under the one above', async () => {
      const actual = await service.assertAddressChain(inputCodes);

      expect(actual).toEqual(mockLoadedChain);
      expect(regionsRepositoryMock.findChain).toHaveBeenCalledWith(inputCodes);
    });

    it('rejects an unknown code on the field that names it, in the validation-pipe shape', async () => {
      regionsRepositoryMock.findChain.mockResolvedValue({ ...mockLoadedChain, village: null });

      const actual = await service.assertAddressChain(inputCodes).catch((err: unknown) => err);

      expect(readErrorBody(actual)).toEqual({
        message: 'Validation failed',
        errors: [
          { code: 'custom', message: 'Unknown village code 31.71.01.1001', path: ['villageCode'] },
        ],
      });
    });

    it('rejects a village that exists but belongs to another district', async () => {
      regionsRepositoryMock.findChain.mockResolvedValue({
        ...mockLoadedChain,
        village: { code: '31.71.01.1001', name: 'Elsewhere', parentCode: '31.71.02' },
      });

      const actual = await service.assertAddressChain(inputCodes).catch((err: unknown) => err);

      expect(readErrorBody(actual).errors).toEqual([
        {
          code: 'custom',
          message: 'villageCode does not belong to districtCode 31.71.01',
          path: ['villageCode'],
        },
      ]);
    });

    it('names the highest broken link, so a moved regency is marked before its district', async () => {
      regionsRepositoryMock.findChain.mockResolvedValue({
        ...mockLoadedChain,
        regency: { code: '31.71', name: 'Moved', parentCode: '32' },
        district: { code: '31.71.01', name: 'Gambir', parentCode: '31.71.99' },
      });

      const actual = await service.assertAddressChain(inputCodes).catch((err: unknown) => err);

      expect(readErrorBody(actual).errors).toEqual([
        expect.objectContaining({ path: ['regencyCode'] }),
      ]);
    });
  });

  describe('assertOptionalAddressChain', () => {
    it('returns null and never reads the master data when no code is given', async () => {
      const actual = await service.assertOptionalAddressChain({});

      expect(actual).toBeNull();
      expect(regionsRepositoryMock.findChain).not.toHaveBeenCalled();
    });

    it('rejects a partial chain with one issue per missing field', async () => {
      const actual = await service
        .assertOptionalAddressChain({ provinceCode: '31', regencyCode: '31.71' })
        .catch((err: unknown) => err);

      expect(readErrorBody(actual).errors).toEqual([
        {
          code: 'custom',
          message: 'All four region codes must be supplied together',
          path: ['districtCode'],
        },
        {
          code: 'custom',
          message: 'All four region codes must be supplied together',
          path: ['villageCode'],
        },
      ]);
      expect(regionsRepositoryMock.findChain).not.toHaveBeenCalled();
    });

    it('checks a full chain exactly as the required path does', async () => {
      const actual = await service.assertOptionalAddressChain({ ...inputCodes });

      expect(actual).toEqual(mockLoadedChain);
      expect(regionsRepositoryMock.findChain).toHaveBeenCalledWith(inputCodes);
    });
  });

  describe('lists', () => {
    it('drops the parent code from a province and keeps it below', async () => {
      regionsRepositoryMock.listProvinces.mockResolvedValue([mockLoadedChain.province]);
      regionsRepositoryMock.listRegencies.mockResolvedValue([mockLoadedChain.regency]);

      const actualProvinces = await service.listProvinces();
      const actualRegencies = await service.listRegencies('31');

      expect(actualProvinces).toEqual([{ code: '31', name: 'Daerah Khusus Ibukota Jakarta' }]);
      expect(actualRegencies).toEqual([
        { code: '31.71', name: 'Kota Administrasi Jakarta Pusat', parentCode: '31' },
      ]);
    });

    it('passes the village search through with its total', async () => {
      regionsRepositoryMock.listVillages.mockResolvedValue({
        items: [mockLoadedChain.village],
        total: 6,
      });
      const inputParams = { districtCode: '31.71.01', q: 'Ga', page: 1, limit: 50 };

      const actual = await service.listVillages(inputParams);

      expect(regionsRepositoryMock.listVillages).toHaveBeenCalledWith(inputParams);
      expect(actual).toEqual({
        items: [{ code: '31.71.01.1001', name: 'Gambir', parentCode: '31.71.01' }],
        total: 6,
      });
    });
  });
});
