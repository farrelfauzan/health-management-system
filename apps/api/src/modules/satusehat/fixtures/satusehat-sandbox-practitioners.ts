import { SatusehatSandboxPractitioner } from '@hms/shared-types';

/**
 * Practitioner test identities usable against the SATUSEHAT **staging**
 * sandbox, for seeding a clinic that has no real practitioner NIKs (SJ-75).
 *
 * Kemenkes publishes ten of these on the Practitioner onboarding page
 * (https://satusehat.kemkes.go.id/platform/docs/id/api-catalogue/onboardings/apis/practitioner/),
 * but that table does not survive contact with the live sandbox. Probed
 * 2026-08-29 against `api-satusehat-stg.dto.kemkes.go.id`:
 *
 * - Five of the ten NIKs answer `total=0` and cannot be linked at all. They are
 *   omitted here: `3322071302900002`, `3171071609900003`, `3207192310600004`,
 *   `3519111703800007`, `3578083008700010`.
 * - The IHS numbers in the published table are wrong for nine of the ten, so
 *   they are deliberately not recorded on this type. Linking resolves the IHS
 *   number from the live index, which is the only trustworthy source.
 * - Every remaining NIK matches more than one Practitioner resource except
 *   `3313096403900009`. The sandbox holds duplicate registrations of the same
 *   person created by different onboarding partners — `7209061211900001` alone
 *   answers with 27 — so `entry[0]` is effectively arbitrary. That is SJ-77,
 *   and until it is fixed a seeded doctor may link to any one of the
 *   duplicates. Entries are therefore ordered by how unambiguous they were
 *   (1, 2, 2, 26, 27 matches), so the doctors seeded first link most reliably.
 *
 * These are synthetic Kemenkes test identifiers, not citizen identifiers — but
 * they are shaped like one, so they are written to the same encrypted columns
 * as any other NIK and never seeded into a production database.
 */
export const SATUSEHAT_SANDBOX_PRACTITIONERS: readonly SatusehatSandboxPractitioner[] = [
  { nik: '3313096403900009', name: 'Sheila Annisa S.Kep' },
  { nik: '3217040109800006', name: 'dr. Olivia Kirana, Sp.OG' },
  { nik: '5271002009700008', name: 'dr. Nathalie Tan, Sp.PK.' },
  { nik: '6408130207800005', name: 'dr. Dito Arifin, Sp.M.' },
  { nik: '7209061211900001', name: 'dr. Alexander' },
] as const;
