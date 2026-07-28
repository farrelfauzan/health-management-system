import { Icd10CodeRecord } from '@hms/shared-types';

import { Icd10CodeRepository } from '../repository/icd10-code.repository';
import { Icd10CodeService } from './icd10-code.service';

describe('Icd10CodeService', () => {
  const mockRepository = {
    searchIcd10Codes: jest.fn(),
  };
  const service = new Icd10CodeService(mockRepository as unknown as Icd10CodeRepository);

  const inputRecord: Icd10CodeRecord = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    code: 'J06.9',
    display: 'Acute upper respiratory infection, unspecified',
    displayIndonesian: 'Infeksi saluran napas atas akut, tidak dijelaskan',
    category: 'J06',
    chapter: 'X',
    isActive: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps a catalog record onto the response contract', async () => {
    mockRepository.searchIcd10Codes.mockResolvedValue([inputRecord]);

    const actual = await service.searchIcd10Codes({ search: 'ispa', limit: 20 });

    expect(actual).toEqual([
      {
        id: inputRecord.id,
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        displayIndonesian: 'Infeksi saluran napas atas akut, tidak dijelaskan',
        category: 'J06',
        chapter: 'X',
        isActive: true,
      },
    ]);
  });

  it('omits absent optional columns instead of emitting nulls', async () => {
    const recordWithoutOptionalColumns: Icd10CodeRecord = {
      ...inputRecord,
      displayIndonesian: null,
      category: null,
      chapter: null,
    };
    mockRepository.searchIcd10Codes.mockResolvedValue([recordWithoutOptionalColumns]);

    const actual = await service.searchIcd10Codes({ limit: 20 });

    expect(actual).toEqual([
      {
        id: inputRecord.id,
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        displayIndonesian: undefined,
        category: undefined,
        chapter: undefined,
        isActive: true,
      },
    ]);
  });

  it('passes the search parameters straight through to the repository', async () => {
    mockRepository.searchIcd10Codes.mockResolvedValue([]);

    await service.searchIcd10Codes({ search: 'J06', category: 'J06', isActive: true, limit: 5 });

    expect(mockRepository.searchIcd10Codes).toHaveBeenCalledWith({
      search: 'J06',
      category: 'J06',
      isActive: true,
      limit: 5,
    });
  });
});
