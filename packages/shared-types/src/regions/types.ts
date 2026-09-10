/** A region row as the repository projects it, at any of the four levels. */
export type RegionRecord = {
  code: string;
  name: string;
  parentCode: string | null;
};

export type ListVillagesParams = {
  districtCode: string;
  q?: string;
  page: number;
  limit: number;
};

export type ListVillagesResult = {
  items: RegionRecord[];
  total: number;
};

/**
 * The four codes a structured address carries. The service checks that each
 * one exists and that each is the parent of the next.
 */
export type AddressChainCodes = {
  provinceCode: string;
  regencyCode: string;
  districtCode: string;
  villageCode: string;
};

/** The four resolved rows, in chain order, once they have been validated. */
export type RegionChain = {
  province: RegionRecord;
  regency: RegionRecord;
  district: RegionRecord;
  village: RegionRecord;
};

export type AddressChainField = keyof AddressChainCodes;

/**
 * What a chain check found wrong, named by the field the client should mark.
 * `UNKNOWN` is a code that is not in the master data; `MISMATCH` is a code
 * that exists but does not sit under the level above it.
 */
export type AddressChainViolation = {
  field: AddressChainField;
  reason: 'UNKNOWN' | 'MISMATCH';
};
