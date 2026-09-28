import { DEFAULT_CLINIC_TIME_ZONE } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { ClinicTimeZoneService } from './clinic-time-zone.service';
import { readClinicTimeZone } from './read-clinic-time-zone';

function buildConfigService(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('readClinicTimeZone', () => {
  it('returns CLINIC_TIMEZONE when it is set', () => {
    const mockConfigService = buildConfigService({ CLINIC_TIMEZONE: 'Asia/Makassar' });
    const actualTimeZone = readClinicTimeZone(mockConfigService);
    expect(actualTimeZone).toBe('Asia/Makassar');
  });

  it('falls back to Asia/Jakarta when CLINIC_TIMEZONE is unset', () => {
    const mockConfigService = buildConfigService({});
    const actualTimeZone = readClinicTimeZone(mockConfigService);
    expect(actualTimeZone).toBe('Asia/Jakarta');
    expect(DEFAULT_CLINIC_TIME_ZONE).toBe('Asia/Jakarta');
  });

  it('keeps an empty value rather than falling back, as every caller did before', () => {
    const mockConfigService = buildConfigService({ CLINIC_TIMEZONE: '' });
    const actualTimeZone = readClinicTimeZone(mockConfigService);
    expect(actualTimeZone).toBe('');
  });
});

describe('ClinicTimeZoneService', () => {
  it('reads the zone through readClinicTimeZone', () => {
    const service = new ClinicTimeZoneService(
      buildConfigService({ CLINIC_TIMEZONE: 'Asia/Jayapura' }),
    );
    const actualTimeZone = service.getTimeZone();
    expect(actualTimeZone).toBe('Asia/Jayapura');
  });

  it('falls back to Asia/Jakarta when CLINIC_TIMEZONE is unset', () => {
    const service = new ClinicTimeZoneService(buildConfigService({}));
    const actualTimeZone = service.getTimeZone();
    expect(actualTimeZone).toBe('Asia/Jakarta');
  });
});
