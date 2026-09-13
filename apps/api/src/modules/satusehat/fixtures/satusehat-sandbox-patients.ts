import { SatusehatSandboxPatient } from '@hms/shared-types';

/**
 * Patient test identities usable against the SATUSEHAT **staging** sandbox
 * (P21-T10), for a local clinic that needs linkable patients.
 *
 * Probed live on 2026-09-12 against `api-satusehat-stg.dto.kemkes.go.id`
 * (`GET /Patient?identifier=https://fhir.kemkes.go.id/id/nik|<nik>`), and only
 * NIKs answering with **exactly one** record are kept — the same rule the
 * practitioner fixture follows, because `entry[0]` of an ambiguous answer is
 * somebody else's national record:
 *
 * - `9271060312000002`, `9271060312000003` — from the published Patient
 *   onboarding table; both resolve to one record.
 * - `0000000000000000`, `1111111111111111`, `9999999999999999` — repeated-digit
 *   seeds; each resolves to one, different, record.
 *
 * Deliberately omitted: `9271060312000001` answers with **two** records, and
 * `3524016901830001` and `3175031305200001` answer with none. The published
 * table fails the same way the practitioner one did (SJ-75), so re-probe
 * before adding to this list rather than copying from the docs.
 *
 * No IHS number is recorded: it is resolved from the NIK at link time, since
 * that is the only value the live index vouches for. Names and sex are local
 * placeholders — see {@link SatusehatSandboxPatient}.
 *
 * These are synthetic Kemenkes test identifiers, not citizen identifiers — but
 * they are shaped like one, so they are written to the same encrypted columns
 * as any other NIK and never seeded into a production database.
 */
export const SATUSEHAT_SANDBOX_PATIENTS: readonly SatusehatSandboxPatient[] = [
  { nik: '9271060312000002', name: 'Pasien Uji Sandbox 1', sex: 'MALE' },
  { nik: '9271060312000003', name: 'Pasien Uji Sandbox 2', sex: 'FEMALE' },
  { nik: '0000000000000000', name: 'Pasien Uji Sandbox 3', sex: 'MALE' },
  { nik: '1111111111111111', name: 'Pasien Uji Sandbox 4', sex: 'FEMALE' },
  { nik: '9999999999999999', name: 'Pasien Uji Sandbox 5', sex: 'MALE' },
] as const;
