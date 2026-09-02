import { ConfigService } from '@nestjs/config';

const MATERAI_THRESHOLD_CONFIG_KEY = 'MATERAI_THRESHOLD_IDR';

/** FR-E1-13: the regulatory default, Rp 5.000.000, unless the operator says otherwise. */
export const DEFAULT_MATERAI_THRESHOLD_IDR = 5_000_000;

/**
 * The total above which the layout reserves a *materai* (stamp duty) area.
 * A placement for a physical stamp only — e-Meterai is out of scope.
 */
export function resolveMateraiThresholdIdr(configService: ConfigService): number {
  const rawValue = configService.get<string>(MATERAI_THRESHOLD_CONFIG_KEY);
  if (rawValue === undefined || rawValue.trim() === '') {
    return DEFAULT_MATERAI_THRESHOLD_IDR;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${MATERAI_THRESHOLD_CONFIG_KEY} must be a non-negative number`);
  }
  return parsed;
}
