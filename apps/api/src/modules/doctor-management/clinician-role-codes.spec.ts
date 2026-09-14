import { CLINICIAN_ROLE_CODES, isClinicianRoleCode } from '@hms/shared-types';

describe('clinician role codes (D-034)', () => {
  it('names doctors and midwives as clinicians', () => {
    expect([...CLINICIAN_ROLE_CODES]).toEqual(['DOCTOR', 'MIDWIFE']);
  });

  it.each(['DOCTOR', 'MIDWIFE'])('treats %s as a clinician', (roleCode) => {
    expect(isClinicianRoleCode(roleCode)).toBe(true);
  });

  it.each(['ADMIN', 'SUPER_ADMIN', 'PHARMACIST', 'LAB_TECHNICIAN', 'PATIENT', 'doctor'])(
    'does not treat %s as a clinician',
    (roleCode) => {
      expect(isClinicianRoleCode(roleCode)).toBe(false);
    },
  );
});
