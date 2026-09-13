import { createDoctorRequestSchema, updateDoctorRequestSchema } from '@hms/shared-types';

/**
 * P21-T08: a doctor create or update may no longer carry a practitioner IHS
 * number. It was stored exactly as sent, unchecked against SATUSEHAT, so a
 * typo linked every later encounter to somebody else's national record. The
 * only ways in are the NIK link and the verified manual link.
 *
 * Asserts on the issue path rather than on overall validity, so the test does
 * not have to track every other required field of the doctor form.
 */
describe('doctor create and update refuse an unverified practitioner id', () => {
  function findIssuePaths(result: {
    success: boolean;
    error?: { issues: Array<{ path: Array<string | number> }> };
  }): string[] {
    return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
  }

  it('refuses the id on create', () => {
    const actual = findIssuePaths(
      createDoctorRequestSchema.safeParse({ satusehatPractitionerId: '10009880728' }),
    );

    expect(actual).toContain('satusehatPractitionerId');
  });

  it('does not complain about the id on a create that leaves it out', () => {
    expect(findIssuePaths(createDoctorRequestSchema.safeParse({}))).not.toContain(
      'satusehatPractitionerId',
    );
  });

  it('refuses the id on update', () => {
    const actual = findIssuePaths(
      updateDoctorRequestSchema.safeParse({ satusehatPractitionerId: '10009880728' }),
    );

    expect(actual).toContain('satusehatPractitionerId');
  });

  /** Clearing is refused too: D-035 clears the link itself when the NIK changes. */
  it('refuses clearing the id on update', () => {
    const actual = findIssuePaths(
      updateDoctorRequestSchema.safeParse({ satusehatPractitionerId: null }),
    );

    expect(actual).toContain('satusehatPractitionerId');
  });

  it('still accepts an ordinary update', () => {
    expect(updateDoctorRequestSchema.safeParse({ fullName: 'dr. Renamed' }).success).toBe(true);
  });
});
