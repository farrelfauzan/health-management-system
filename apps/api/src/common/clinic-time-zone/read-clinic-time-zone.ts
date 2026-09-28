import { DEFAULT_CLINIC_TIME_ZONE } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

/**
 * The clinic's IANA time zone: `CLINIC_TIMEZONE`, or
 * {@link DEFAULT_CLINIC_TIME_ZONE} when it is unset.
 *
 * A function rather than only {@link ClinicTimeZoneService} so the services
 * that already inject `ConfigService` read the zone the same way without a new
 * constructor dependency. Only an absent value falls back; the zone is not
 * validated here.
 */
export function readClinicTimeZone(configService: ConfigService): string {
  return configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
}
