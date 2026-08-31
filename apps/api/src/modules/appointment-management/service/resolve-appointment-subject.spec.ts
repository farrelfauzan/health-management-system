import { resolveAppointmentSubject } from './resolve-appointment-subject';

describe('resolveAppointmentSubject', () => {
  const inputPatient = { id: 'patient-1', mrn: 'MRN00000042', fullName: 'Budi Santoso' };
  const inputProspective = { id: 'prospective-1', fullName: 'Siti Rahayu' };

  it('resolves a registered patient with their MRN', () => {
    const actualSubject = resolveAppointmentSubject({
      patient: inputPatient,
      prospectivePatient: null,
    });

    expect(actualSubject).toEqual({
      kind: 'PATIENT',
      id: 'patient-1',
      fullName: 'Budi Santoso',
      mrn: 'MRN00000042',
    });
  });

  it('resolves a prospective patient with no MRN rather than a blank one', () => {
    const actualSubject = resolveAppointmentSubject({
      patient: null,
      prospectivePatient: inputProspective,
    });

    // Absent, never '' — a caller rendering an empty string reads as a patient
    // whose MRN failed to load, which is the misread P17-T01 exists to prevent.
    expect(actualSubject).toEqual({
      kind: 'PROSPECTIVE_PATIENT',
      id: 'prospective-1',
      fullName: 'Siti Rahayu',
    });
    expect(actualSubject.mrn).toBeUndefined();
  });

  it('prefers the patient when both sides are somehow present', () => {
    // Unreachable while the one-subject CHECK stands. If the constraint were
    // ever dropped, resolving to the registered record is the safe half: it
    // shows a real MRN rather than hiding a converted booking behind a stale
    // prospective name.
    const actualSubject = resolveAppointmentSubject({
      patient: inputPatient,
      prospectivePatient: inputProspective,
    });

    expect(actualSubject.kind).toBe('PATIENT');
  });

  it('treats an omitted relation the same as a null one', () => {
    // A projection that leaves the key out arrives as `undefined`, and a strict
    // `!== null` check would take the branch for the side that is not there.
    // This is exactly what a loosely-typed test stub produces, and it is how the
    // chat schedule tool broke in CI rather than in tsc.
    const actualSubject = resolveAppointmentSubject({
      prospectivePatient: inputProspective,
    } as unknown as Parameters<typeof resolveAppointmentSubject>[0]);

    expect(actualSubject.kind).toBe('PROSPECTIVE_PATIENT');
    expect(actualSubject.fullName).toBe('Siti Rahayu');
  });

  it('throws rather than inventing a subject when neither side is set', () => {
    expect(() =>
      resolveAppointmentSubject({ patient: null, prospectivePatient: null }),
    ).toThrow(/neither a patient nor a prospective patient/);
  });
});
