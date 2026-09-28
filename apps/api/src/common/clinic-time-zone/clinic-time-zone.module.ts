import { Global, Module } from '@nestjs/common';

import { ClinicTimeZoneService } from './clinic-time-zone.service';

/**
 * Global access to the clinic's time zone, so every module cuts calendar days
 * the same way instead of each keeping its own fallback.
 */
@Global()
@Module({
  providers: [ClinicTimeZoneService],
  exports: [ClinicTimeZoneService],
})
export class ClinicTimeZoneModule {}
