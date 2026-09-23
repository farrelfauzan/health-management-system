import { z } from 'zod';

import type { CoretaxFakturTemplateSource, CoretaxReferenceOption } from '#taxes/types';

/**
 * Coretax Faktur Pajak Keluaran bulk import (P27-T09, SJ-250): the XML DJP's
 * "Converter Excel to XML Coretax v1.6" writes from its Faktur PK Excel
 * template. Every value here was read from the official package on
 * pajak.go.id node 112031 (downloaded 2026-09-22), never from memory: the
 * element names and their order from DJP's "Sample Faktur PK Template
 * v.1.4.xml" shipped inside the converter, the columns, mandatory flags and
 * formulas from "Sample Faktur PK Template v.1.6.1.xlsx", and the code lists
 * from its REF sheets. DJP publishes no XSD for this file.
 *
 * A new DJP version is a new entry here and a new serializer in the API.
 */
export const coretaxFakturTemplateVersionSchema = z.enum(['V1_6']);

export type CoretaxFakturTemplateVersionValue = z.infer<typeof coretaxFakturTemplateVersionSchema>;

export const CORETAX_FAKTUR_CURRENT_TEMPLATE_VERSION: CoretaxFakturTemplateVersionValue = 'V1_6';

/** Where each template came from; `sha256` is of the converter package as downloaded. */
export const CORETAX_FAKTUR_TEMPLATES: Readonly<
  Record<CoretaxFakturTemplateVersionValue, CoretaxFakturTemplateSource>
> = {
  V1_6: {
    format: 'FAKTUR_KELUARAN',
    version: 'V1_6',
    title: 'Converter Excel to XML Coretax v1.6 (Faktur PK template v.1.6.1, sample XML v.1.4)',
    publishedOn: '2026-01-23',
    sourceUrl: 'https://pajak.go.id/sites/default/files/2026-01/ConverterEfakturCoretax__v1.6.zip',
    catalogueUrl: 'https://www.pajak.go.id/id/node/112031',
    sha256: 'ef5957af98ed06d7aee3c0fed6a67b56fe6f515bf776788194b2acd9a005b791',
  },
};

export const coretaxFakturExportQuerySchema = z.object({
  templateVersion: coretaxFakturTemplateVersionSchema.optional(),
});

export type CoretaxFakturExportQuery = z.infer<typeof coretaxFakturExportQuerySchema>;

/** "Kode Barang Jasa": six digits. The template marks it optional but validated when filled. */
export const coretaxItemCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Use the six-digit Coretax goods/services code');

/** "Nama Satuan Ukur", REF-General of template v1.6.1: `UM.0001` … `UM.0039`. */
export const CORETAX_UNIT_OPTIONS: readonly CoretaxReferenceOption[] = [
  { code: 'UM.0001', label: 'Metrik Ton' },
  { code: 'UM.0002', label: 'Wet Ton' },
  { code: 'UM.0003', label: 'Kilogram' },
  { code: 'UM.0004', label: 'Gram' },
  { code: 'UM.0005', label: 'Karat' },
  { code: 'UM.0006', label: 'Kiloliter' },
  { code: 'UM.0007', label: 'Liter' },
  { code: 'UM.0008', label: 'Barrel' },
  { code: 'UM.0009', label: 'MMBTU' },
  { code: 'UM.0010', label: 'Ampere' },
  { code: 'UM.0011', label: 'Sentimeter Kubik' },
  { code: 'UM.0012', label: 'Meter Persegi' },
  { code: 'UM.0013', label: 'Meter' },
  { code: 'UM.0014', label: 'Inci' },
  { code: 'UM.0015', label: 'Sentimeter' },
  { code: 'UM.0016', label: 'Yard' },
  { code: 'UM.0017', label: 'Lusin' },
  { code: 'UM.0018', label: 'Unit' },
  { code: 'UM.0019', label: 'Set' },
  { code: 'UM.0020', label: 'Lembar' },
  { code: 'UM.0021', label: 'Piece' },
  { code: 'UM.0022', label: 'Boks' },
  { code: 'UM.0023', label: 'Tahun' },
  { code: 'UM.0024', label: 'Bulan' },
  { code: 'UM.0025', label: 'Minggu' },
  { code: 'UM.0026', label: 'Hari' },
  { code: 'UM.0027', label: 'Jam' },
  { code: 'UM.0028', label: 'Menit' },
  { code: 'UM.0029', label: 'Persen' },
  { code: 'UM.0030', label: 'Kegiatan' },
  { code: 'UM.0031', label: 'Laporan' },
  { code: 'UM.0032', label: 'Bahan' },
  { code: 'UM.0033', label: 'Lainnya' },
  { code: 'UM.0034', label: 'Meter Kubik' },
  { code: 'UM.0035', label: 'Sentimeter Persegi' },
  { code: 'UM.0036', label: 'Drum' },
  { code: 'UM.0037', label: 'Karton' },
  { code: 'UM.0038', label: 'Kwh' },
  { code: 'UM.0039', label: 'Roll' },
];

export const coretaxUnitCodeSchema = z
  .string()
  .refine((value) => CORETAX_UNIT_OPTIONS.some((option) => option.code === value), {
    message: "Use a unit from DJP's Coretax list (UM.0001–UM.0039)",
  });

/** "Keterangan Tambahan" for kode 08, REF-KetTambahan of template v1.6.1. */
export const CORETAX_KODE_08_ADDITIONAL_INFO_OPTIONS: readonly CoretaxReferenceOption[] = [
  { code: 'TD.00501', label: 'untuk BKP dan JKP Tertentu' },
  { code: 'TD.00502', label: 'untuk BKP Tertentu yang Bersifat Strategis' },
  { code: 'TD.00503', label: 'untuk Jasa Kebandarudaraan' },
  { code: 'TD.00504', label: 'untuk Lainnya' },
  {
    code: 'TD.00505',
    label: 'untuk BKP Tertentu yang Bersifat Strategis sesuai PP Nomor 81 Tahun 2015',
  },
  {
    code: 'TD.00506',
    label: 'untuk Penyerahan Jasa Kepelabuhan Tertentu untuk kegiatan angkutan laut Luar Negeri',
  },
  { code: 'TD.00507', label: 'untuk Penyerahan Air Bersih' },
  {
    code: 'TD.00508',
    label: 'Penyerahan BKP tertentu yang bersifat strategis berdasarkan PP 48 Tahun 2020',
  },
  {
    code: 'TD.00509',
    label: 'Penyerahan kepada Perwakilan Negara Asing dan Badan Internasional serta Pejabatnya',
  },
  { code: 'TD.00510', label: 'BKP dan JKP tertentu' },
];

/** "Cap Fasilitas" for kode 08, REF-CapFasilitas of template v1.6.1. */
export const CORETAX_KODE_08_FACILITY_STAMP_OPTIONS: readonly CoretaxReferenceOption[] = [
  {
    code: 'TD.01101',
    label:
      'PPN Dibebaskan Sesuai PP Nomor 146 Tahun 2000 Sebagaimana Telah Diubah Dengan PP Nomor 38 Tahun 2003',
  },
  {
    code: 'TD.01102',
    label:
      'PPN Dibebaskan Sesuai PP Nomor 12 Tahun 2001 Sebagaimana Telah Beberapa Kali Diubah Terakhir Dengan PP Nomor 31 Tahun 2007',
  },
  {
    code: 'TD.01103',
    label: 'PPN dibebaskan berdasarkan Peraturan Pemerintah Nomor 28 Tahun 2009',
  },
  { code: 'TD.01104', label: '(Tidak ada cap)' },
  { code: 'TD.01105', label: 'PPN Dibebaskan Sesuai Dengan PP Nomor 81 Tahun 2015' },
  { code: 'TD.01106', label: 'PPN Dibebaskan Berdasarkan PP Nomor 74 Tahun 2015' },
  { code: 'TD.01107', label: '(tanpa cap)' },
  {
    code: 'TD.01108',
    label:
      'PPN DIBEBASKAN SESUAI PP NOMOR 81 TAHUN 2015 SEBAGAIMANA TELAH DIUBAH DENGAN PP 48 TAHUN 2020',
  },
  { code: 'TD.01109', label: 'PPN DIBEBASKAN BERDASARKAN PP NOMOR 47 TAHUN 2020' },
  { code: 'TD.01110', label: 'PPN Dibebaskan berdasarkan PP Nomor 49 Tahun 2022' },
];

export const coretaxAdditionalInfoSchema = z
  .string()
  .refine(
    (value) => CORETAX_KODE_08_ADDITIONAL_INFO_OPTIONS.some((option) => option.code === value),
    { message: "Use a kode-08 keterangan tambahan from DJP's list (TD.00501–TD.00510)" },
  );

export const coretaxFacilityStampSchema = z
  .string()
  .refine(
    (value) => CORETAX_KODE_08_FACILITY_STAMP_OPTIONS.some((option) => option.code === value),
    { message: "Use a kode-08 cap fasilitas from DJP's list (TD.01101–TD.01110)" },
  );

/** "Jenis Faktur": the template says always `Normal`. */
export const CORETAX_FAKTUR_OPTION = 'Normal';

/**
 * A buyer without NPWP, as the template's Keterangan sheet spells it: TIN
 * `0000000000000000`, the ID type and number, and NITKU `000000`. A patient
 * is identified by NIK (`National ID`); the country is REF-KodeNegara `IDN`.
 */
export const CORETAX_FAKTUR_NON_TIN_BUYER_TIN = '0000000000000000';
export const CORETAX_FAKTUR_NON_TIN_BUYER_IDTKU = '000000';
export const CORETAX_FAKTUR_NATIONAL_ID_DOCUMENT = 'National ID';
export const CORETAX_FAKTUR_BUYER_COUNTRY = 'IDN';

/** "Barang/Jasa" (REF-General): `A` goods, `B` services. */
export const CORETAX_FAKTUR_GOODS_OPTION = 'A';
export const CORETAX_FAKTUR_SERVICES_OPTION = 'B';

/**
 * The rate a kode-08 line states. An exempt code stores no rate (P27-T03),
 * but the template's PPN column is "Tarif PPN × DPP Nilai Lain"; 12% is the
 * UU HPP rate. Whether a kode-08 line should instead show DPP nilai lain
 * 11/12 is a tax-consultant question; the template allows either.
 */
export const CORETAX_KODE_08_STATED_VAT_RATE_PERCENT = 12;

/** The faktur codes the export writes: the ones the tax module assigns. */
export const CORETAX_FAKTUR_EXPORTED_CODES = ['01', '04', '08'] as const;

/**
 * Why a faktur or the clinic cannot go into the file yet. The web shows a
 * translated sentence per code; the API's `message` is the English fallback.
 */
export const coretaxFakturIssueCodeSchema = z.enum([
  'CLINIC_NPWP_INVALID',
  'CLINIC_NITKU_INVALID',
  'ITEM_CODE_MISSING',
  'UNIT_CODE_MISSING',
  'FACILITY_MISSING',
  'BUYER_NAME_MISSING',
  'BUYER_ADDRESS_MISSING',
]);

export type CoretaxFakturIssueCodeValue = z.infer<typeof coretaxFakturIssueCodeSchema>;

/** 422: the report cannot be exported yet; `details` lists every problem, per invoice. */
export const CORETAX_FAKTUR_EXPORT_INVALID_ERROR_CODE = 'CORETAX_EXPORT_INVALID';
