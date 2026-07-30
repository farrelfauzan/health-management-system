import { ConfigService } from '@nestjs/config';

export const MINIMUM_RME_RETENTION_YEARS = 25;

export function resolveRmeRetentionYears(configService: ConfigService): number {
  const rawValue = configService.get<string>('RME_RETENTION_YEARS')?.trim();
  if (!rawValue) {
    return MINIMUM_RME_RETENTION_YEARS;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < MINIMUM_RME_RETENTION_YEARS) {
    throw new Error(
      `Retention configuration error: RME_RETENTION_YEARS must be an integer of at least ${MINIMUM_RME_RETENTION_YEARS}`,
    );
  }
  return value;
}
