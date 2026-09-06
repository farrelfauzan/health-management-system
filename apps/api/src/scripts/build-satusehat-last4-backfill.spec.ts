import { buildSatusehatLast4Backfill } from './build-satusehat-last4-backfill';

describe('buildSatusehatLast4Backfill', () => {
  const decryptToIhsNumber = (ciphertext: string) => ciphertext.replace('sealed:', '');

  it('derives the last four characters of each decrypted IHS number', () => {
    const actualPlan = buildSatusehatLast4Backfill(
      [
        { id: 'patient-1', satusehat_patient_id_ciphertext: 'sealed:P02478375538' },
        { id: 'patient-2', satusehat_patient_id_ciphertext: 'sealed:P09876543210' },
      ],
      decryptToIhsNumber,
    );

    expect(actualPlan.updates).toEqual([
      { patientId: 'patient-1', last4: '5538' },
      { patientId: 'patient-2', last4: '3210' },
    ]);
    expect(actualPlan.undecryptablePatientIds).toEqual([]);
  });

  it('names a row whose ciphertext will not decrypt instead of guessing at it', () => {
    const actualPlan = buildSatusehatLast4Backfill(
      [
        { id: 'patient-1', satusehat_patient_id_ciphertext: 'sealed:P02478375538' },
        { id: 'patient-broken', satusehat_patient_id_ciphertext: 'corrupt' },
      ],
      (ciphertext) => {
        if (ciphertext === 'corrupt') {
          throw new Error('auth tag mismatch');
        }
        return decryptToIhsNumber(ciphertext);
      },
    );

    expect(actualPlan.updates).toEqual([{ patientId: 'patient-1', last4: '5538' }]);
    expect(actualPlan.undecryptablePatientIds).toEqual(['patient-broken']);
  });

  it('plans nothing for an empty candidate set, so a re-run is a no-op', () => {
    const actualPlan = buildSatusehatLast4Backfill([], decryptToIhsNumber);

    expect(actualPlan.updates).toEqual([]);
    expect(actualPlan.undecryptablePatientIds).toEqual([]);
  });
});
