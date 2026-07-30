import { describe, expect, it } from 'vitest';

import { getFacilityKindLabel } from './facility-config';

describe('getFacilityKindLabel', () => {
  it('returns the facility kind in the requested locale', () => {
    expect(getFacilityKindLabel('clinic', 'id')).toBe('Klinik');
    expect(getFacilityKindLabel('hospital', 'en')).toBe('Hospital');
  });
});
