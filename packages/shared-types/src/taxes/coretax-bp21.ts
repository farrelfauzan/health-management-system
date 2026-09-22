import { z } from 'zod';

import type {
  ClinicianPtkpStatusValue,
  ClinicianProfessionValue,
} from '#doctor-management/schemas';
import type { CoretaxTemplateSource } from '#taxes/types';

/**
 * Coretax BP21 bulk import (P27-T08, SJ-249): the XML DJP's own Excel→XML
 * converter produces for "Bukti Pemotongan Final dan Tidak Final Selain
 * Pegawai Tetap (BP21)". Every value here was read from the official
 * workbook, never from memory: the embedded XML map (`xl/xmlMaps.xml`, root
 * `Bp21Bulk`), its REF sheet and the sample DJP publishes beside it.
 *
 * A new DJP version is a new entry here and a new serializer in the API; the
 * old ones stay so a finalized month can be exported again exactly as before.
 */
export const coretaxBp21TemplateVersionSchema = z.enum(['V4']);

export type CoretaxBp21TemplateVersionValue = z.infer<typeof coretaxBp21TemplateVersionSchema>;

export const CORETAX_BP21_TEMPLATE_VERSIONS = coretaxBp21TemplateVersionSchema.options;

export const CORETAX_BP21_CURRENT_TEMPLATE_VERSION: CoretaxBp21TemplateVersionValue = 'V4';

/** Where each template came from; `sha256` is of the workbook as downloaded on 2026-09-22. */
export const CORETAX_BP21_TEMPLATES: Readonly<
  Record<CoretaxBp21TemplateVersionValue, CoretaxTemplateSource>
> = {
  V4: {
    format: 'BP21',
    version: 'V4',
    title: 'BP21 Excel to XML v.4',
    publishedOn: '2025-04-17',
    sourceUrl: 'https://pajak.go.id/sites/default/files/2025-04/BP21%20Excel%20to%20XML%20v.4.xlsx',
    catalogueUrl: 'https://www.pajak.go.id/id/node/112031',
    sha256: '511bec3d57f61f2273112fdbae66b373be372df12c3ae13146d8373d1ca840cf',
  },
};

export const coretaxBp21ExportQuerySchema = z.object({
  templateVersion: coretaxBp21TemplateVersionSchema.optional(),
});

export type CoretaxBp21ExportQuery = z.infer<typeof coretaxBp21ExportQuerySchema>;

/**
 * The PTKP labels of the template's `PtkpType` enumeration. The bukan pegawai
 * tax never reads the status, but the schema requires it on every line.
 */
export const CORETAX_PTKP_LABELS: Readonly<Record<ClinicianPtkpStatusValue, string>> = {
  TK_0: 'TK/0',
  TK_1: 'TK/1',
  TK_2: 'TK/2',
  TK_3: 'TK/3',
  K_0: 'K/0',
  K_1: 'K/1',
  K_2: 'K/2',
  K_3: 'K/3',
};

/**
 * Kode objek pajak per profession, from the v4 REF sheet (both are Deemed 50,
 * Tarif PS17 there, matching D-041). `21-100-07` is "Imbalan kepada Tenaga
 * Ahli (… Dokter …)". A midwife is not in that list of tenaga ahli, so she is
 * `21-100-20`, "Imbalan kepada Pemberi Jasa dalam Segala Bidang" — our
 * reading, to be confirmed with the tax consultant (PRD §6).
 */
export const CORETAX_BP21_TAX_OBJECT_CODES: Readonly<Record<ClinicianProfessionValue, string>> = {
  DOCTOR: '21-100-07',
  MIDWIFE: '21-100-20',
};

/** `TaxCertificate`: no facility (no SKB, no DTP) — the only case the draft computes. */
export const CORETAX_BP21_NO_FACILITY = 'N/A';

/**
 * `Document`: the reference document the withholding rests on. The clinician
 * fee statement is a payment record; `PaymentProof` ("Bukti Pembayaran") is
 * in both the v4 REF sheet and the schema's `DocType` enumeration.
 */
export const CORETAX_BP21_REFERENCE_DOCUMENT = 'PaymentProof';

/** Prefix of `DocumentNumber`: the clinician's jasa medis statement for the month. */
export const CORETAX_BP21_DOCUMENT_NUMBER_PREFIX = 'JM';

/**
 * Why a line or the clinic cannot go into the BP21 file yet. The web shows a
 * translated sentence per code; the API's `message` is the English fallback.
 */
export const coretaxBp21IssueCodeSchema = z.enum([
  'CLINIC_NPWP_INVALID',
  'CLINIC_NITKU_INVALID',
  'TAX_IDENTITY_MISSING',
  'TAX_IDENTITY_NOT_16_DIGITS',
  'PTKP_STATUS_MISSING',
  'GROSS_NOT_POSITIVE',
  'AMOUNT_PRECISION',
]);

export type CoretaxBp21IssueCodeValue = z.infer<typeof coretaxBp21IssueCodeSchema>;

/** 422: the report cannot be exported yet; `details` lists every problem, per clinician. */
export const CORETAX_EXPORT_INVALID_ERROR_CODE = 'CORETAX_EXPORT_INVALID';
