import { validateManagedDocumentAgainstType } from '@hms/shared-types';

/**
 * FR-E5-35 (`P16-T36`) as the matrix the ticket names: the shared function
 * both the API and the web form run, so the two never disagree about what
 * a type asks for.
 */
describe('validateManagedDocumentAgainstType', () => {
  const drafted = { hasContentHtml: true, hasStorageKey: false };
  const uploaded = { hasContentHtml: false, hasStorageKey: true };
  const noParties = { patientId: null, doctorId: null };

  it('AGREEMENT_PATIENT_CLINIC needs a patient and refuses a doctor', () => {
    const rules = { requiresPatient: true, requiresDoctor: false, contentMode: 'EITHER' as const };

    expect(validateManagedDocumentAgainstType(rules, { ...noParties, ...drafted })).toEqual([
      { code: 'PATIENT_REQUIRED', field: 'patientId' },
    ]);
    expect(
      validateManagedDocumentAgainstType(rules, { patientId: 'p', doctorId: 'd', ...drafted }),
    ).toEqual([{ code: 'DOCTOR_NOT_ALLOWED', field: 'doctorId' }]);
    expect(
      validateManagedDocumentAgainstType(rules, { patientId: 'p', doctorId: null, ...drafted }),
    ).toEqual([]);
  });

  it('AGREEMENT_PATIENT_DOCTOR needs both parties', () => {
    const rules = { requiresPatient: true, requiresDoctor: true, contentMode: 'EITHER' as const };

    expect(
      validateManagedDocumentAgainstType(rules, { ...noParties, ...drafted }).map(
        (issue) => issue.code,
      ),
    ).toEqual(['PATIENT_REQUIRED', 'DOCTOR_REQUIRED']);
  });

  it('CLINIC_POLICY_SOP accepts no party at all', () => {
    const rules = { requiresPatient: false, requiresDoctor: false, contentMode: 'EITHER' as const };

    expect(
      validateManagedDocumentAgainstType(rules, { patientId: 'p', doctorId: null, ...drafted }),
    ).toEqual([{ code: 'PATIENT_NOT_ALLOWED', field: 'patientId' }]);
  });

  it('EITHER accepts drafted-only or uploaded-only and refuses both', () => {
    const rules = { requiresPatient: false, requiresDoctor: false, contentMode: 'EITHER' as const };

    expect(validateManagedDocumentAgainstType(rules, { ...noParties, ...drafted })).toEqual([]);
    expect(validateManagedDocumentAgainstType(rules, { ...noParties, ...uploaded })).toEqual([]);
    expect(
      validateManagedDocumentAgainstType(rules, {
        ...noParties,
        hasContentHtml: true,
        hasStorageKey: true,
      }),
    ).toEqual([{ code: 'CONTENT_BOTH', field: 'storageKey' }]);
  });

  it('DRAFTED refuses a file and UPLOADED demands one', () => {
    expect(
      validateManagedDocumentAgainstType(
        { requiresPatient: false, requiresDoctor: false, contentMode: 'DRAFTED' },
        { ...noParties, ...uploaded },
      ),
    ).toEqual([{ code: 'CONTENT_MUST_BE_DRAFTED', field: 'storageKey' }]);
    expect(
      validateManagedDocumentAgainstType(
        { requiresPatient: false, requiresDoctor: false, contentMode: 'UPLOADED' },
        { ...noParties, ...drafted },
      ),
    ).toEqual([{ code: 'CONTENT_MUST_BE_UPLOADED', field: 'storageKey' }]);
  });
});
