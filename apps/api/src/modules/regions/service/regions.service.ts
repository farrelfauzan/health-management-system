import {
  AddressChainCodes,
  AddressChainField,
  AddressChainViolation,
  ListVillagesParams,
  ListVillagesResult,
  Region,
  RegionChain,
  RegionRecord,
} from '@hms/shared-types';
import { BadRequestException, Injectable } from '@nestjs/common';

import { RegionsRepository } from '../repository/regions.repository';
import { resolveAddressChain } from './resolve-address-chain';

const ADDRESS_CHAIN_FIELDS: readonly AddressChainField[] = [
  'provinceCode',
  'regencyCode',
  'districtCode',
  'villageCode',
];

const LEVEL_LABEL_BY_FIELD: Readonly<Record<AddressChainField, string>> = {
  provinceCode: 'province',
  regencyCode: 'regency',
  districtCode: 'district',
  villageCode: 'village',
};

const PARENT_FIELD_BY_FIELD: Readonly<Record<AddressChainField, AddressChainField | null>> = {
  provinceCode: null,
  regencyCode: 'provinceCode',
  districtCode: 'regencyCode',
  villageCode: 'districtCode',
};

/**
 * One Zod issue, in the shape `ZodValidationPipe` puts under `error.details`,
 * so a client marks a chain failure on the field exactly as it marks a
 * pattern failure — one code path for both.
 */
type FieldIssue = {
  code: 'custom';
  message: string;
  path: [AddressChainField];
};

type OptionalAddressChainCodes = Partial<Record<AddressChainField, string | undefined>>;

/**
 * The region master data as the API serves it, and the one check every
 * patient write with a structured address goes through (P19-T10).
 */
@Injectable()
export class RegionsService {
  constructor(private readonly regionsRepository: RegionsRepository) {}

  async listProvinces(): Promise<Region[]> {
    const rows = await this.regionsRepository.listProvinces();
    return rows.map(toRegion);
  }

  async listRegencies(provinceCode: string): Promise<Region[]> {
    const rows = await this.regionsRepository.listRegencies(provinceCode);
    return rows.map(toRegion);
  }

  async listDistricts(regencyCode: string): Promise<Region[]> {
    const rows = await this.regionsRepository.listDistricts(regencyCode);
    return rows.map(toRegion);
  }

  async listVillages(params: ListVillagesParams): Promise<{ items: Region[]; total: number }> {
    const result: ListVillagesResult = await this.regionsRepository.listVillages(params);
    return { items: result.items.map(toRegion), total: result.total };
  }

  /**
   * Proves that the four codes exist and chain — village in district,
   * district in regency, regency in province — against the master data, and
   * returns the resolved rows. A failure is a 400 carrying one field-level
   * issue on the offending code, in the same `details` shape the validation
   * pipe produces for a malformed one.
   */
  async assertAddressChain(codes: AddressChainCodes): Promise<RegionChain> {
    const loaded = await this.regionsRepository.findChain(codes);
    const resolved = resolveAddressChain(codes, loaded);
    if ('violation' in resolved) {
      throw buildChainException([buildViolationIssue(codes, resolved.violation)]);
    }
    return resolved.chain;
  }

  /**
   * The same check for a write where the codes are optional: none given is
   * fine, all four given are checked, anything in between is rejected with
   * an issue on each missing field — a chain is replaced whole or not at all.
   */
  async assertOptionalAddressChain(codes: OptionalAddressChainCodes): Promise<RegionChain | null> {
    const missing = ADDRESS_CHAIN_FIELDS.filter((field) => codes[field] === undefined);
    if (missing.length === ADDRESS_CHAIN_FIELDS.length) {
      return null;
    }
    if (missing.length > 0) {
      throw buildChainException(
        missing.map((field) => ({
          code: 'custom',
          message: 'All four region codes must be supplied together',
          path: [field],
        })),
      );
    }
    return this.assertAddressChain({
      provinceCode: codes.provinceCode ?? '',
      regencyCode: codes.regencyCode ?? '',
      districtCode: codes.districtCode ?? '',
      villageCode: codes.villageCode ?? '',
    });
  }
}

function toRegion(record: RegionRecord): Region {
  return {
    code: record.code,
    name: record.name,
    ...(record.parentCode === null ? {} : { parentCode: record.parentCode }),
  };
}

function buildViolationIssue(codes: AddressChainCodes, violation: AddressChainViolation): FieldIssue {
  const label = LEVEL_LABEL_BY_FIELD[violation.field];
  const code = codes[violation.field];
  if (violation.reason === 'UNKNOWN') {
    return { code: 'custom', message: `Unknown ${label} code ${code}`, path: [violation.field] };
  }
  const parentField = PARENT_FIELD_BY_FIELD[violation.field];
  const parentCode = parentField === null ? '' : codes[parentField];
  return {
    code: 'custom',
    message: `${violation.field} does not belong to ${parentField ?? ''} ${parentCode}`,
    path: [violation.field],
  };
}

function buildChainException(issues: FieldIssue[]): BadRequestException {
  return new BadRequestException({ message: 'Validation failed', errors: issues });
}
