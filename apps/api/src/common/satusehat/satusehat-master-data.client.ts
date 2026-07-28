import { Injectable } from '@nestjs/common';

import { SatusehatHttpClient } from './satusehat-http.client';
import { SatusehatError } from './satusehat.error';
import { SatusehatSearchBundle } from './satusehat.types';

const NIK_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik';

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

  /** Resolves a practitioner IHS number by NIK; null when the index has no match. */
  async findPractitionerIhsNumberByNik(nik: string): Promise<string | null> {
    return this.findIhsNumberByNik('/Practitioner', nik);
  }

  private async findIhsNumberByNik(resourcePath: string, nik: string): Promise<string | null> {
    const bundle = await this.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: resourcePath,
      query: { identifier: `${NIK_IDENTIFIER_SYSTEM}|${nik}` },
    });
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
}
