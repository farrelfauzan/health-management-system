import { z } from 'zod';

/**
 * Kemendagri `kode wilayah` (P19-T10). The dots are part of the code: `11` is
 * a province, `11.01` a regency inside it, `11.01.01` a district, and
 * `11.01.01.2001` a village. The prefix relationship is what makes the four
 * levels a chain, and it is checked structurally here before the service
 * checks it against the master data.
 */
export const PROVINCE_CODE_PATTERN = /^\d{2}$/;
export const REGENCY_CODE_PATTERN = /^\d{2}\.\d{2}$/;
export const DISTRICT_CODE_PATTERN = /^\d{2}\.\d{2}\.\d{2}$/;
export const VILLAGE_CODE_PATTERN = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/;

/** `003/007` — RT and RW as the KTP prints them, one to three digits each. */
export const RT_RW_PATTERN = /^\d{1,3}\/\d{1,3}$/;

/** Indonesian postal codes are exactly five digits. */
export const POSTAL_CODE_PATTERN = /^\d{5}$/;

export const REGIONS_LIST_DEFAULT_LIMIT = 50;
export const REGIONS_LIST_MAX_LIMIT = 200;

export const provinceCodeSchema = z
  .string()
  .trim()
  .regex(PROVINCE_CODE_PATTERN, 'Province code must look like 11');
export const regencyCodeSchema = z
  .string()
  .trim()
  .regex(REGENCY_CODE_PATTERN, 'Regency code must look like 11.01');
export const districtCodeSchema = z
  .string()
  .trim()
  .regex(DISTRICT_CODE_PATTERN, 'District code must look like 11.01.01');
export const villageCodeSchema = z
  .string()
  .trim()
  .regex(VILLAGE_CODE_PATTERN, 'Village code must look like 11.01.01.2001');
export const rtRwSchema = z.string().trim().regex(RT_RW_PATTERN, 'RT/RW must look like 003/007');
export const postalCodeSchema = z
  .string()
  .trim()
  .regex(POSTAL_CODE_PATTERN, 'Postal code must be five digits');

export const listRegenciesQuerySchema = z.object({
  provinceCode: provinceCodeSchema,
});

export const listDistrictsQuerySchema = z.object({
  regencyCode: regencyCodeSchema,
});

/**
 * Villages are the one level worth paging: a district holds up to a few
 * hundred of them, and the form fills a combobox from a typed prefix rather
 * than listing every row. `page`/`limit` follow the patient list.
 */
export const listVillagesQuerySchema = z.object({
  districtCode: districtCodeSchema,
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REGIONS_LIST_MAX_LIMIT)
    .default(REGIONS_LIST_DEFAULT_LIMIT),
});

export type ListRegenciesQueryInput = z.infer<typeof listRegenciesQuerySchema>;
export type ListDistrictsQueryInput = z.infer<typeof listDistrictsQuerySchema>;
export type ListVillagesQueryInput = z.infer<typeof listVillagesQuerySchema>;
