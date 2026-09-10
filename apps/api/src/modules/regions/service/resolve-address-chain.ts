import {
  AddressChainCodes,
  AddressChainViolation,
  RegionChain,
  RegionRecord,
} from '@hms/shared-types';

type LoadedChain = {
  province: RegionRecord | null;
  regency: RegionRecord | null;
  district: RegionRecord | null;
  village: RegionRecord | null;
};

type ChainLevel = {
  readonly field: keyof AddressChainCodes;
  readonly row: keyof LoadedChain;
  readonly parentField: keyof AddressChainCodes | null;
};

type ResolvedAddressChain = { chain: RegionChain } | { violation: AddressChainViolation };

const CHAIN_LEVELS: readonly ChainLevel[] = [
  { field: 'provinceCode', row: 'province', parentField: null },
  { field: 'regencyCode', row: 'regency', parentField: 'provinceCode' },
  { field: 'districtCode', row: 'district', parentField: 'regencyCode' },
  { field: 'villageCode', row: 'village', parentField: 'districtCode' },
];

/**
 * Either the four resolved rows or the first thing wrong with them, walking
 * top-down (P19-T10). Top-down on purpose: a village under the wrong
 * district is usually the clerk having changed the district and not the
 * village, and the field to mark is the lowest one that no longer fits,
 * which is the first one a downward walk finds out of place.
 */
export function resolveAddressChain(
  codes: AddressChainCodes,
  loaded: LoadedChain,
): ResolvedAddressChain {
  for (const level of CHAIN_LEVELS) {
    const row = loaded[level.row];
    if (row === null) {
      return { violation: { field: level.field, reason: 'UNKNOWN' } };
    }
    if (level.parentField !== null && row.parentCode !== codes[level.parentField]) {
      return { violation: { field: level.field, reason: 'MISMATCH' } };
    }
  }
  return {
    chain: {
      province: loaded.province as RegionRecord,
      regency: loaded.regency as RegionRecord,
      district: loaded.district as RegionRecord,
      village: loaded.village as RegionRecord,
    },
  };
}
