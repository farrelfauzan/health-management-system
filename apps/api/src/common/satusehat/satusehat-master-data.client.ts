import { SatusehatNewbornSearchCriteria, SatusehatPractitionerSummary } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { readPractitionerSummary } from './read-practitioner-summary';
import { SatusehatFhirNewbornPatient } from './satusehat-fhir.types';
import { selectNewbornPatientEntry } from './select-newborn-patient-entry';
import { SatusehatAmbiguousMatchError } from './satusehat-ambiguous-match.error';
import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatError } from './satusehat.error';
import { SatusehatSearchBundle } from './satusehat.types';

const NIK_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik';
/** How a baby with no NIK of her own is held: under her mother's (P24-T11). */
const NIK_IBU_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik-ibu';
/** HTTP status the platform answers for an id it does not hold (P21-T01). */
const NOT_FOUND_STATUS = 404;

/**
 * Master-data lookups against the SATUSEHAT master patient / practitioner
 * index. Returns bare IHS numbers so FHIR bundle shapes never leave the
 * adapter layer; the NIK travels only in the outbound query and is never
 * logged. Practitioner resolution is NIK-based — STR is not a supported FHIR
 * search parameter on the platform.
 */
@Injectable()
export class SatusehatMasterDataClient {
  constructor(private readonly httpClient: SatusehatHttpClient) {}

  /** Resolves a patient IHS number by NIK; null when the MPI has no match. */
  async findPatientIhsNumberByNik(nik: string): Promise<string | null> {
    return this.findIhsNumberByNik('/Patient', nik);
  }

  /**
   * Finds a baby who has no NIK of her own, under her mother's (P24-T11,
   * FR-NB-03).
   *
   * A mother's NIK identifies every one of her children, so this search is
   * expected to return siblings — the birth date and birth order are what
   * pick one out, and `selectNewbornPatientEntry` refuses to guess between
   * them. Null means the platform does not hold her yet, which is the
   * caller's signal to create her.
   *
   * Unlike the NIK search, more than one entry is **not** ambiguous here: it
   * is a family. The mother's NIK never leaves this method.
   */
  async findNewbornIhsNumberByMotherNik(
    motherNik: string,
    criteria: SatusehatNewbornSearchCriteria,
  ): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: '/Patient',
      query: { identifier: `${NIK_IBU_IDENTIFIER_SYSTEM}|${motherNik}` },
    });
    return selectNewbornPatientEntry(bundle, criteria);
  }

  /**
   * Creates the baby on the master patient index and returns the IHS number
   * it assigned (P24-T11, FR-NB-04).
   *
   * Upstream failures are deliberately left to propagate as they come: the
   * platform answers a create with 500 on staging, and the HTTP client maps
   * every 5xx to `SATUSEHAT_UNAVAILABLE`, which the submission worker retries.
   * Wrapping it as a data error here would park a reportable birth as FAILED
   * over an outage.
   */
  async createNewbornPatient(resource: SatusehatFhirNewbornPatient): Promise<string> {
    const created = await this.httpClient.sendRequest<{ id?: unknown }>({
      method: 'POST',
      path: '/Patient',
      body: resource,
    });
    const ihsNumber = created?.id;
    if (typeof ihsNumber !== 'string' || ihsNumber === '') {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT created a patient without returning its id',
      );
    }
    return ihsNumber;
  }

  /** Resolves a practitioner IHS number by NIK; null when the index has no match. */
  async findPractitionerIhsNumberByNik(nik: string): Promise<string | null> {
    return this.findIhsNumberByNik('/Practitioner', nik);
  }

  /**
   * Reads one practitioner by IHS number — the resource id — so an operator can
   * confirm a hand-typed link before it is saved (P21-T08). Null when the
   * platform does not hold it. Keyed on the 404 status, because the body says
   * `no-store` / `storage_error` and never "not found" (P21-T01).
   */
  async findPractitionerById(ihsNumber: string): Promise<SatusehatPractitionerSummary | null> {
    try {
      const resource = await this.httpClient.sendRequest<unknown>({
        method: 'GET',
        path: `/Practitioner/${encodeURIComponent(ihsNumber)}`,
      });
      return readPractitionerSummary(resource, ihsNumber);
    } catch (caughtError) {
      if (
        caughtError instanceof SatusehatError &&
        caughtError.upstreamStatusCode === NOT_FOUND_STATUS
      ) {
        return null;
      }
      throw caughtError;
    }
  }

  /**
   * One NIK identifies one person, so more than one match means the index
   * itself is ambiguous — a data problem on the platform, not something this
   * code can arbitrate. The platform masks NIK in its responses, so there is
   * nothing to re-verify the match against; taking the first entry would link
   * the profile to somebody else's national record and every later bundle
   * would land on the wrong person. `total` is trusted over `entry.length`
   * because a paged response can truncate the entries while still reporting
   * the true count.
   */
  private async findIhsNumberByNik(resourcePath: string, nik: string): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: resourcePath,
      query: { identifier: `${NIK_IDENTIFIER_SYSTEM}|${nik}` },
    });
    const matchCount = this.countMatches(bundle);
    if (matchCount > 1) {
      throw new SatusehatAmbiguousMatchError(matchCount);
    }
    const firstEntry = bundle.entry?.[0];
    if (firstEntry === undefined) {
      return null;
    }
    const ihsNumber = firstEntry.resource?.id;
    if (typeof ihsNumber !== 'string' || ihsNumber === '') {
      throw new SatusehatError(
        'SATUSEHAT_UNAVAILABLE',
        'SATUSEHAT returned a search result without a resource id',
      );
    }
    return ihsNumber;
  }

  private countMatches(bundle: SatusehatSearchBundle): number {
    return typeof bundle.total === 'number' ? bundle.total : (bundle.entry?.length ?? 0);
  }
}
