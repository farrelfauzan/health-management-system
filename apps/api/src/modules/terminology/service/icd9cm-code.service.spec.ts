import { Icd9cmCodeRecord } from '@hms/shared-types';

import { Icd9cmCodeRepository } from '../repository/icd9cm-code.repository';
import { Icd9cmCodeService } from './icd9cm-code.service';

describe('Icd9cmCodeService', () => {
  const mockRepository = {
    searchIcd9cmCodes: jest.fn(),
  };
  const service = new Icd9cmCodeService(mockRepository as unknown as Icd9cmCodeRepository);

  const inputRecord: Icd9cmCodeRecord = {
    id: 'ffffffff-ffff-4fff-8fff-fffffffffff9',
    code: '93.94',
    display: 'Respiratory medication administered by nebulizer',
    displayIndonesian: 'Pemberian obat pernapasan melalui nebulizer',
    category: '93',
    isActive: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps a catalog record onto the response contract', async () => {
    mockRepository.searchIcd9cmCodes.mockResolvedValue([inputRecord]);

    const actual = await service.searchIcd9cmCodes({ search: 'nebul', limit: 20 });

    expect(actual).toEqual([
      {
        id: inputRecord.id,
        code: '93.94',
        display: 'Respiratory medication administered by nebulizer',
        displayIndonesian: 'Pemberian obat pernapasan melalui nebulizer',
        category: '93',
        isActive: true,
      },
    ]);
  });

  it('omits absent optional columns instead of emitting nulls', async () => {
    mockRepository.searchIcd9cmCodes.mockResolvedValue([
      { ...inputRecord, displayIndonesian: null, category: null },
    ]);

    const actual = await service.searchIcd9cmCodes({ limit: 20 });

    expect(actual).toEqual([
      {
        id: inputRecord.id,
        code: '93.94',
        display: 'Respiratory medication administered by nebulizer',
        displayIndonesian: undefined,
        category: undefined,
        isActive: true,
      },
    ]);
  });

  it('passes the search parameters straight through to the repository', async () => {
    mockRepository.searchIcd9cmCodes.mockResolvedValue([]);

    await service.searchIcd9cmCodes({ search: '93', category: '93', isActive: true, limit: 5 });

    expect(mockRepository.searchIcd9cmCodes).toHaveBeenCalledWith({
      search: '93',
      category: '93',
      isActive: true,
      limit: 5,
    });
  });
});
