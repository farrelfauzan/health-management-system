import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mapSatusehatTransportError } from './map-satusehat-transport-error';
import { SatusehatTokenClient } from './satusehat-token.client';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import {
  SatusehatConfig,
  SatusehatKfaProduct,
  SatusehatKfaResponseItem,
  SatusehatKfaSearchResponse,
} from './satusehat.types';

const PRODUCTS_PATH = '/products/all';
const PHARMACY_PRODUCT_TYPE = 'farmasi';

/**
 * Product lookups against the KFA (Kamus Farmasi dan Alat Kesehatan) dictionary
 * — the catalog SATUSEHAT validates `Medication.code` against (rule 10024).
 *
 * Separate from {@link SatusehatHttpClient}, which prefixes every path with the
 * FHIR base URL: KFA is a different service on the same platform, and it
 * answers plain JSON rather than FHIR. A lookup is typed by a person waiting
 * for results, so it makes one attempt and surfaces the failure rather than
 * retrying behind a spinner.
 */
@Injectable()
export class SatusehatKfaClient {
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    configService: ConfigService,
    private readonly tokenClient: SatusehatTokenClient,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /**
   * Products whose name matches `keyword`, newest KFA data first as the
   * platform returns them. Only the fields the catalog form needs are kept —
   * the raw KFA row carries pricing, registration and packaging detail that
   * has no place in a clinic's medication record.
   */
  async searchProducts(keyword: string, limit: number): Promise<SatusehatKfaProduct[]> {
    if (!this.satusehatConfig.isConfigured) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT credentials are not configured for this deployment',
      );
    }
    const response = await this.fetchProducts(keyword, limit);
    if (!response.ok) {
      throw this.describeFailure(response.status);
    }
    const body = await this.parseBody(response);
    return this.extractProducts(body);
  }

  private async fetchProducts(keyword: string, limit: number): Promise<Response> {
    const accessToken = await this.tokenClient.getAccessToken();
    const query = new URLSearchParams({
      page: '1',
      size: String(limit),
      product_type: PHARMACY_PRODUCT_TYPE,
      keyword,
    });
    try {
      return await fetch(`${this.satusehatConfig.kfaBaseUrl}${PRODUCTS_PATH}?${query.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.satusehatConfig.requestTimeoutMs),
      });
    } catch (caughtError) {
      throw mapSatusehatTransportError(caughtError);
    }
  }

  private describeFailure(status: number): SatusehatError {
    if (status === 401 || status === 403) {
      return new SatusehatError(
        'SATUSEHAT_UNAUTHORIZED',
        `SATUSEHAT rejected the KFA lookup credentials (HTTP ${status})`,
        status,
      );
    }
    if (status === 429 || status >= 500) {
      return new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        `SATUSEHAT KFA lookup is unavailable (HTTP ${status})`,
        status,
      );
    }
    return new SatusehatError(
      'SATUSEHAT_REQUEST_REJECTED',
      `SATUSEHAT rejected the KFA lookup (HTTP ${status})`,
      status,
    );
  }

  private async parseBody(response: Response): Promise<SatusehatKfaSearchResponse> {
    const body: unknown = await response.json().catch(() => undefined);
    if (typeof body !== 'object' || body === null) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT returned a malformed KFA response body',
        response.status,
      );
    }
    return body as SatusehatKfaSearchResponse;
  }

  /**
   * `items` is an array on some deployments and `{ data: [...] }` on others,
   * so both are read rather than trusting one shape a sandbox happened to
   * return. A row without a code or a name is dropped: it cannot be chosen.
   */
  private extractProducts(body: SatusehatKfaSearchResponse): SatusehatKfaProduct[] {
    const rawItems = body.items;
    const items: SatusehatKfaResponseItem[] = Array.isArray(rawItems)
      ? rawItems
      : (rawItems?.data ?? []);
    return items.flatMap((item) => {
      const kfaCode = typeof item.kfa_code === 'string' ? item.kfa_code.trim() : '';
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (kfaCode === '' || name === '') {
        return [];
      }
      return [
        {
          kfaCode,
          name,
          dosageForm: typeof item.dosage_form?.name === 'string' ? item.dosage_form.name : null,
          manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : null,
          packagingUnit: typeof item.uom?.name === 'string' ? item.uom.name : null,
          isActive: item.active === true,
        },
      ];
    });
  }
}
