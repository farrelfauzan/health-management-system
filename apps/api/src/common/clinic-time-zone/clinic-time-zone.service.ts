import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { readClinicTimeZone } from './read-clinic-time-zone';

/**
 * The clinic's time zone for providers that need nothing else from
 * `ConfigService`. Registered globally by {@link ClinicTimeZoneModule}.
 */
@Injectable()
export class ClinicTimeZoneService {
  constructor(private readonly configService: ConfigService) {}

  /** Returns `CLINIC_TIMEZONE`, or `Asia/Jakarta` when it is unset. */
  getTimeZone(): string {
    return readClinicTimeZone(this.configService);
  }
}
