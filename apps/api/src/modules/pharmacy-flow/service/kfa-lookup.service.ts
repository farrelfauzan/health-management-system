import { KfaProductResponse, SearchKfaProductsQueryInput } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { SatusehatKfaClient } from '../../../common/satusehat/satusehat-kfa.client';

/**
 * The KFA product lookup behind the medication catalog form. Without it a
 * clinic types a national code by hand and only learns it was wrong when a
 * whole encounter is rejected at submission (rule 10024, "Code not found").
 *
 * Retired products are dropped rather than shown greyed out: a catalog row
 * created today must not point at a code SATUSEHAT no longer accepts, and a
 * clinic keeping an existing code keeps it by not touching the field.
 */
@Injectable()
export class KfaLookupService {
  constructor(private readonly kfaClient: SatusehatKfaClient) {}

  async searchKfaProducts(query: SearchKfaProductsQueryInput): Promise<KfaProductResponse[]> {
    const products = await this.kfaClient.searchProducts(query.search, query.limit);
    return products.filter((product) => product.isActive);
  }
}
