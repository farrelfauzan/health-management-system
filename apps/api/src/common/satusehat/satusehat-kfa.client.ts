import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { mapSatusehatTransportError } from './map-satusehat-transport-error';
import { SatusehatTokenClient } from './satusehat-token.client';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import {
  SatusehatConfig,
  SatusehatKfaProduct,
  SatusehatKfaProductDetailResponse,
  SatusehatKfaResponseItem,
  SatusehatKfaSearchResponse,
} from './satusehat.types';

const PRODUCTS_PATH = '/products/all';
const PRODUCT_DETAIL_PATH = '/products';
const PHARMACY_PRODUCT_TYPE = 'farmasi';
const KFA_IDENTIFIER = 'kfa';

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
    const body = (await this.parseBody(response)) as SatusehatKfaSearchResponse;
    return this.extractProducts(body);
  }

  /**
   * One product by its KFA code, from the detail endpoint the P25-T04 probe
   * verified, or null when KFA does not know the code — a template (92-level)
   * code answers `result: null` here, which is how the formulary preview
   * tells a product code from anything else. Same single attempt as a search:
   * an administrator is waiting on the preview.
   */
  async getProduct(kfaCode: string): Promise<SatusehatKfaProduct | null> {
    if (!this.satusehatConfig.isConfigured) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT credentials are not configured for this deployment',
      );
    }
    const query = new URLSearchParams({ identifier: KFA_IDENTIFIER, code: kfaCode });
    const response = await this.fetchJson(`${PRODUCT_DETAIL_PATH}?${query.toString()}`);
    if (!response.ok) {
      throw this.describeFailure(response.status);
    }
    const body = (await this.parseBody(response)) as SatusehatKfaProductDetailResponse;
    const result = body.result;
    if (typeof result !== 'object' || result === null) {
      return null;
    }
    return this.extractProducts({ items: [result] })[0] ?? null;
  }

  private async fetchProducts(keyword: string, limit: number): Promise<Response> {
    const query = new URLSearchParams({
      page: '1',
      size: String(limit),
      product_type: PHARMACY_PRODUCT_TYPE,
      keyword,
    });
    return this.fetchJson(`${PRODUCTS_PATH}?${query.toString()}`);
  }

  private async fetchJson(pathWithQuery: string): Promise<Response> {
    const accessToken = await this.tokenClient.getAccessToken();
    try {
      return await fetch(`${this.satusehatConfig.kfaBaseUrl}${pathWithQuery}`, {
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

  private async parseBody(
    response: Response,
  ): Promise<SatusehatKfaSearchResponse | SatusehatKfaProductDetailResponse> {
    const body: unknown = await response.json().catch(() => undefined);
    if (typeof body !== 'object' || body === null) {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT returned a malformed KFA response body',
        response.status,
      );
    }
    return body as SatusehatKfaSearchResponse | SatusehatKfaProductDetailResponse;
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
          templateKfaCode: readTemplateKfaCode(item),
        },
      ];
    });
  }
}

/**
 * The template code, trimmed, or null. Read defensively: the probe saw the
 * key on every farmasi and alkes row, but a dictionary this large is not
 * uniform and a missing template must never drop the product.
 */
function readTemplateKfaCode(item: SatusehatKfaResponseItem): string | null {
  const rawCode = item.product_template?.kfa_code;
  const templateKfaCode = typeof rawCode === 'string' ? rawCode.trim() : '';
  return templateKfaCode === '' ? null : templateKfaCode;
}
