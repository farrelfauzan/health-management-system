import { ConfigService } from '@nestjs/config';

import { MINIMUM_RME_RETENTION_YEARS, resolveRmeRetentionYears } from './retention.config';

describe('resolveRmeRetentionYears', () => {
  it('defaults to the enforceable 25-year minimum', () => {
    expect(resolveRmeRetentionYears(new ConfigService({}))).toBe(MINIMUM_RME_RETENTION_YEARS);
  });

  it('accepts a longer configured retention period', () => {
    expect(resolveRmeRetentionYears(new ConfigService({ RME_RETENTION_YEARS: '30' }))).toBe(30);
  });

  it('rejects a period below 25 years', () => {
    expect(() =>
      resolveRmeRetentionYears(new ConfigService({ RME_RETENTION_YEARS: '24' })),
    ).toThrow('at least 25');
  });
});
