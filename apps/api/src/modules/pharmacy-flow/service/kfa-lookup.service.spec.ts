import { SatusehatKfaClient } from '../../../common/satusehat/satusehat-kfa.client';
import { KfaLookupService } from './kfa-lookup.service';

describe('KfaLookupService', () => {
  const searchProducts = jest.fn();
  const kfaClient = { searchProducts } as unknown as SatusehatKfaClient;
  const service = new KfaLookupService(kfaClient);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the search term and limit to the platform', async () => {
    searchProducts.mockResolvedValue([]);

    await service.searchKfaProducts({ search: 'omeprazole', limit: 15 });

    expect(searchProducts).toHaveBeenCalledWith('omeprazole', 15);
  });

  it('offers only active products, so a new row cannot point at a retired code', async () => {
    const activeProduct = {
      kfaCode: '93020847',
      name: 'Omeprazole 20 mg Kapsul Lepas Tunda (HEXPHARM)',
      dosageForm: 'Kapsul Pelepasan Lambat',
      manufacturer: 'HEXPHARM',
      packagingUnit: 'Kapsul',
      isActive: true,
    };
    searchProducts.mockResolvedValue([
      activeProduct,
      { ...activeProduct, kfaCode: '93004010', name: 'Omeprazole 20 mg Kapsul', isActive: false },
    ]);

    const actualProducts = await service.searchKfaProducts({ search: 'omeprazole', limit: 20 });

    expect(actualProducts).toEqual([activeProduct]);
  });
});
