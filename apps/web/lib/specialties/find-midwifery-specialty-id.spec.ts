import type { Specialty } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { findMidwiferySpecialtyId } from './find-midwifery-specialty-id';

function buildSpecialty(id: string, name: string, isActive = true): Specialty {
  return { id, name, isActive, createdAt: '', updatedAt: '' };
}

describe('findMidwiferySpecialtyId', () => {
  it('finds the Kebidanan poli whatever its case', () => {
    const inputSpecialties = [
      buildSpecialty('obgyn', 'Obstetrics & Gynecology'),
      buildSpecialty('kebidanan', ' KEBIDANAN '),
    ];

    expect(findMidwiferySpecialtyId(inputSpecialties)).toBe('kebidanan');
  });

  it('offers no default when the clinic deactivated it', () => {
    expect(findMidwiferySpecialtyId([buildSpecialty('kebidanan', 'Kebidanan', false)])).toBeUndefined();
  });

  it('offers no default when the clinic has none', () => {
    expect(findMidwiferySpecialtyId([buildSpecialty('gp', 'General Practice')])).toBeUndefined();
  });
});
