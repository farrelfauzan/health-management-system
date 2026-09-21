import { Injectable } from '@nestjs/common';

import { buildSatusehatEpisodeOfCareIdentifierSystem } from './satusehat-episode-of-care-coding';
import { SatusehatFhirEpisodeOfCare, SatusehatJsonPatchOperation } from './satusehat-fhir.types';
import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatError } from './satusehat.error';
import { SatusehatSearchBundle } from './satusehat.types';

/**
 * EpisodeOfCare reads and writes against the SATUSEHAT FHIR gateway (P25-T08).
 *
 * POST is not retried by the HTTP client, so the search is what makes a repeat
 * safe — the same shape as {@link SatusehatLocationClient}. Here the platform
 * enforces it too: it refuses a second **active** episode of the same type for
 * one patient (Rule 10109/10110), so a retry after a timeout that in fact
 * landed cannot duplicate — but the refusal carries no id, which is why the
 * search has to run first rather than as a fallback.
 *
 * The close is a PATCH, never a PUT: `PUT /EpisodeOfCare/:id` answers `403`
 * ("consent or privacy rules"). See `docs/ops/satusehat-anc-spike.md`.
 */
@Injectable()
export class SatusehatEpisodeOfCareClient {
  constructor(private readonly httpClient: SatusehatHttpClient) {}

  /**
   * The episode registered under our own identifier, or null when there is none.
   *
   * `typeCode` narrows the search to one episode type (P25-T12): a pregnancy's
   * ANC and PNC episodes carry the same identifier — the pregnancy row — and
   * the sandbox accepts the pair and honours `type` alongside `identifier`.
   */
  async findEpisodeIdByIdentifier(
    organizationId: string,
    localId: string,
    typeCode?: string,
  ): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: '/EpisodeOfCare',
      query: {
        identifier: `${buildSatusehatEpisodeOfCareIdentifierSystem(organizationId)}|${localId}`,
        ...(typeCode === undefined ? {} : { type: typeCode }),
      },
    });
    return this.readFirstEpisodeId(bundle);
  }

  /**
   * The patient's open episode of this type, whoever created it.
   *
   * Deliberately not scoped to our organisation: the platform allows only one
   * active episode per patient per type, so another clinic's open ANC episode
   * is not a competitor to ours — it is the one this pregnancy has, and the
   * only one the platform will let this patient's visits reference.
   */
  async findActiveEpisodeIdByPatient(
    patientIhsNumber: string,
    typeCode: string,
  ): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: '/EpisodeOfCare',
      query: { patient: patientIhsNumber, type: typeCode, status: 'active' },
    });
    return this.readFirstEpisodeId(bundle);
  }

  /** Creates an episode and returns the id SATUSEHAT assigned. */
  async createEpisodeOfCare(resource: SatusehatFhirEpisodeOfCare): Promise<string> {
    const created = await this.httpClient.sendRequest<{ id?: unknown }>({
      method: 'POST',
      path: '/EpisodeOfCare',
      body: resource,
    });
    if (typeof created?.id !== 'string' || created.id === '') {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT created the EpisodeOfCare but returned no id',
      );
    }
    return created.id;
  }

  /**
   * Applies an RFC 6902 operation list to an episode.
   *
   * Every list must also replace `/patient`: the validator reads only the
   * patch document, so without it even a one-line status change fails with
   * "patient reference can't be empty". {@link SatusehatFhirMapper} builds the
   * list, so this method only sends it.
   */
  async patchEpisodeOfCare(
    satusehatEpisodeOfCareId: string,
    operations: readonly SatusehatJsonPatchOperation[],
  ): Promise<void> {
    await this.httpClient.sendRequest<unknown>({
      method: 'PATCH',
      path: `/EpisodeOfCare/${encodeURIComponent(satusehatEpisodeOfCareId)}`,
      body: operations,
      contentType: 'application/json-patch+json',
    });
  }

  private readFirstEpisodeId(bundle: SatusehatSearchBundle): string | null {
    const id = bundle.entry?.[0]?.resource?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  }
}
