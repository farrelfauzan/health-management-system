import { buildClinicianProfessionMismatchReport } from './build-clinician-profession-mismatch-report';
import { ClinicianProfessionRow } from './clinician-profession-mismatch-report.types';

function buildRow(overrides: Partial<ClinicianProfessionRow> = {}): ClinicianProfessionRow {
  return { userId: 'user-1', roleCode: 'DOCTOR', profession: 'DOCTOR', ...overrides };
}

describe('buildClinicianProfessionMismatchReport', () => {
  it('reports nothing when every role matches its profession', () => {
    const inputRows = [
      buildRow({ userId: 'user-1', roleCode: 'DOCTOR', profession: 'DOCTOR' }),
      buildRow({ userId: 'user-2', roleCode: 'MIDWIFE', profession: 'MIDWIFE' }),
    ];

    const actual = buildClinicianProfessionMismatchReport(inputRows);

    expect(actual).toEqual({
      clinicianUserCount: 2,
      midwifeRoleWithDoctorProfession: { count: 0, userIds: [] },
      doctorRoleWithMidwifeProfession: { count: 0, userIds: [] },
    });
  });

  it('flags a midwife whose profile still says DOCTOR', () => {
    const inputRows = [buildRow({ userId: 'user-9', roleCode: 'MIDWIFE', profession: 'DOCTOR' })];

    const actual = buildClinicianProfessionMismatchReport(inputRows);

    expect(actual.midwifeRoleWithDoctorProfession).toEqual({ count: 1, userIds: ['user-9'] });
    expect(actual.doctorRoleWithMidwifeProfession.count).toBe(0);
  });

  it('flags the reverse: a doctor whose profile says MIDWIFE', () => {
    const inputRows = [buildRow({ userId: 'user-3', roleCode: 'DOCTOR', profession: 'MIDWIFE' })];

    const actual = buildClinicianProfessionMismatchReport(inputRows);

    expect(actual.doctorRoleWithMidwifeProfession).toEqual({ count: 1, userIds: ['user-3'] });
  });

  it('counts a user holding both roles once, in the bucket their profile contradicts', () => {
    const inputRows = [
      buildRow({ userId: 'user-4', roleCode: 'DOCTOR', profession: 'DOCTOR' }),
      buildRow({ userId: 'user-4', roleCode: 'MIDWIFE', profession: 'DOCTOR' }),
      buildRow({ userId: 'user-4', roleCode: 'MIDWIFE', profession: 'DOCTOR' }),
    ];

    const actual = buildClinicianProfessionMismatchReport(inputRows);

    expect(actual.clinicianUserCount).toBe(1);
    expect(actual.midwifeRoleWithDoctorProfession).toEqual({ count: 1, userIds: ['user-4'] });
    expect(actual.doctorRoleWithMidwifeProfession.count).toBe(0);
  });
});
