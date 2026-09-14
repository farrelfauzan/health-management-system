import { Injectable } from '@nestjs/common';

import { buildSatusehatLocationIdentifierSystem } from './build-satusehat-location-resource';
import { SatusehatFhirLocation } from './satusehat-fhir.types';
import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatError } from './satusehat.error';
import { SatusehatSearchBundle } from './satusehat.types';

/**
 * Location reads and writes against the SATUSEHAT FHIR gateway (P24-T06).
 *
 * POST is not retried by the HTTP client, which is correct for a create: the
 * identifier search is what makes a registration safe to repeat, and the
 * registration service runs it before every POST.
 */
@Injectable()
export class SatusehatLocationClient {
  constructor(private readonly httpClient: SatusehatHttpClient) {}

  /** The id of the Location registered under our row UUID, or null when there is none. */
  async findLocationIdByIdentifier(organizationId: string, localId: string): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: '/Location',
      query: { identifier: `${buildSatusehatLocationIdentifierSystem(organizationId)}|${localId}` },
    });
    const id = bundle.entry?.[0]?.resource?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  }

  /** Creates a Location and returns the id SATUSEHAT assigned. */
  async createLocation(resource: SatusehatFhirLocation): Promise<string> {
    const created = await this.httpClient.sendRequest<{ id?: unknown }>({
      method: 'POST',
      path: '/Location',
      body: resource,
    });
    if (typeof created?.id !== 'string' || created.id === '') {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT created the Location but returned no id',
      );
    }
    return created.id;
  }

  /** Replaces a registered Location — a rename, or `status: inactive` (FR-LOC-08). */
  async updateLocation(satusehatLocationId: string, resource: SatusehatFhirLocation): Promise<void> {
    await this.httpClient.sendRequest<unknown>({
      method: 'PUT',
      path: `/Location/${encodeURIComponent(satusehatLocationId)}`,
      body: resource,
    });
  }
}
