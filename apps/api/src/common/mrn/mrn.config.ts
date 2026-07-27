import { ConfigService } from '@nestjs/config';

import { MrnConfig } from './mrn.types';

const DEFAULT_MRN_WIDTH = 8;
const MINIMUM_MRN_WIDTH = 4;
const MAXIMUM_MRN_WIDTH = 18;
const MAXIMUM_MRN_PREFIX_LENGTH = 8;
const PREFIX_PATTERN = /^[A-Z0-9-]*$/;

function readPrefix(configService: ConfigService): string {
  const rawValue = configService.get<string>('PATIENT_MRN_PREFIX')?.trim() ?? '';
  if (rawValue.length > MAXIMUM_MRN_PREFIX_LENGTH) {
    throw new Error(
      `MRN configuration error: PATIENT_MRN_PREFIX must be at most ${MAXIMUM_MRN_PREFIX_LENGTH} characters`,
    );
  }
  if (!PREFIX_PATTERN.test(rawValue)) {
    throw new Error(
      'MRN configuration error: PATIENT_MRN_PREFIX must contain only uppercase letters, digits and hyphens',
    );
  }
  return rawValue;
}

function readWidth(configService: ConfigService): number {
  const rawValue = configService.get<string>('PATIENT_MRN_WIDTH')?.trim();
  if (rawValue === undefined || rawValue === '') {
    return DEFAULT_MRN_WIDTH;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < MINIMUM_MRN_WIDTH || parsed > MAXIMUM_MRN_WIDTH) {
    throw new Error(
      `MRN configuration error: PATIENT_MRN_WIDTH must be an integer between ${MINIMUM_MRN_WIDTH} and ${MAXIMUM_MRN_WIDTH}`,
    );
  }
  return parsed;
}

/**
 * Resolves the MRN format at startup. Front-desk staff read these numbers aloud
 * and write them on physical folders, so the default is a short zero-padded
 * sequence with no prefix; widening or prefixing is a deployment decision that
 * must be made before any patient exists, because the format is baked into
 * every number already allocated.
 */
export function resolveMrnConfig(configService: ConfigService): MrnConfig {
  return {
    prefix: readPrefix(configService),
    width: readWidth(configService),
  };
}
