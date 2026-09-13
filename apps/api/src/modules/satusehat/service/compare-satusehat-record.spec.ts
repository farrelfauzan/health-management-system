import {
  SatusehatHeldResource,
  SatusehatLabReportItem,
  SatusehatRecordComparisonInput,
  SatusehatSubmissionVitalSigns,
} from '@hms/shared-types';

import { SATUSEHAT_READ_BACK_FIXTURES } from '../fixtures/satusehat-read-back-fixtures';
import { compareSatusehatRecord } from './compare-satusehat-record';

/**
 * Driven by resources recorded off the live platform (P21-T01) wherever one
 * exists — the recorded Condition, Procedure and Medication — because the
 * failures this guards against are shape surprises: a `Condition` has no
 * `status`, and codes sit in `code.coding[]` under specific systems.
 */
describe('compareSatusehatRecord', () => {
  const RECORDED_CONDITION = SATUSEHAT_READ_BACK_FIXTURES.Condition;
  const RECORDED_PROCEDURE = SATUSEHAT_READ_BACK_FIXTURES.Procedure;
  const RECORDED_MEDICATION = SATUSEHAT_READ_BACK_FIXTURES.Medication;

  function buildVitals(
    overrides: Partial<SatusehatSubmissionVitalSigns> = {},
  ): SatusehatSubmissionVitalSigns {
    return {
      recordedAt: new Date('2026-09-11T14:40:00.000Z'),
      heightCm: null,
      weightKg: null,
      systolicBloodPressure: null,
      diastolicBloodPressure: null,
      pulseRate: null,
      respiratoryRate: null,
      temperatureCelsius: null,
      oxygenSaturation: null,
      ...overrides,
    };
  }

  /** A vital-sign Observation the way the mapper sends it. */
  function buildHeldVital(loincCode: string, value: number): SatusehatHeldResource {
    return {
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://loinc.org', code: loincCode, display: loincCode }] },
      valueQuantity: { value, unit: 'mm[Hg]', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    };
  }

  function buildInput(
    overrides: Partial<SatusehatRecordComparisonInput> = {},
  ): SatusehatRecordComparisonInput {
    return {
      diagnoses: [],
      latestVitalSigns: null,
      procedures: [],
      medications: [],
      labItems: [],
      held: [],
      ...overrides,
    };
  }

  describe('diagnoses', () => {
    /** The recorded Condition carries `clinicalStatus` and no `status`. */
    it('matches a diagnosis SATUSEHAT holds under the same ICD-10 code, status or not', () => {
      expect('status' in RECORDED_CONDITION).toBe(false);
      const actual = compareSatusehatRecord(
        buildInput({
          diagnoses: [
            {
              code: 'A90',
              display: 'Dengue fever [classical dengue]',
              type: 'PRIMARY',
              recordedAt: new Date(),
            },
          ],
          held: [RECORDED_CONDITION],
        }),
      );

      expect(actual).toEqual([
        {
          category: 'DIAGNOSIS',
          code: 'A90',
          display: 'Dengue fever [classical dengue]',
          ours: 'Dengue fever [classical dengue]',
          satusehat: 'Dengue fever [classical dengue]',
          outcome: 'MATCHES',
          notSentReason: null,
        },
      ]);
    });

    it('reports a diagnosis SATUSEHAT does not hold as missing', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          diagnoses: [
            { code: 'J06.9', display: 'Acute URI', type: 'PRIMARY', recordedAt: new Date() },
          ],
        }),
      );

      expect(actual[0]).toMatchObject({
        code: 'J06.9',
        outcome: 'MISSING_ON_SATUSEHAT',
        satusehat: null,
      });
    });

    it('reports a diagnosis SATUSEHAT holds but the local record no longer has as differing', () => {
      const actual = compareSatusehatRecord(buildInput({ held: [RECORDED_CONDITION] }));

      expect(actual).toEqual([
        expect.objectContaining({
          category: 'DIAGNOSIS',
          code: 'A90',
          ours: null,
          outcome: 'DIFFERS',
        }),
      ]);
    });
  });

  describe('vital signs', () => {
    it('matches a reading SATUSEHAT holds with the same value', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          latestVitalSigns: buildVitals({ systolicBloodPressure: 120 }),
          held: [buildHeldVital('8480-6', 120)],
        }),
      );

      expect(actual).toEqual([
        {
          category: 'VITAL_SIGN',
          code: '8480-6',
          display: 'Systolic blood pressure',
          ours: '120 mmHg',
          satusehat: '120 mmHg',
          outcome: 'MATCHES',
          notSentReason: null,
        },
      ]);
    });

    it('reports a reading SATUSEHAT holds with a different value as differing, showing both', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          latestVitalSigns: buildVitals({ systolicBloodPressure: 120 }),
          held: [buildHeldVital('8480-6', 130)],
        }),
      );

      expect(actual[0]).toMatchObject({
        ours: '120 mmHg',
        satusehat: '130 mmHg',
        outcome: 'DIFFERS',
      });
    });

    it('reports a reading SATUSEHAT does not hold as missing', () => {
      const actual = compareSatusehatRecord(
        buildInput({ latestVitalSigns: buildVitals({ temperatureCelsius: 37.5 }) }),
      );

      expect(actual).toEqual([
        expect.objectContaining({
          code: '8310-5',
          ours: '37.5 C',
          outcome: 'MISSING_ON_SATUSEHAT',
        }),
      ]);
    });

    it('produces no line for a vital sign nobody recorded', () => {
      expect(compareSatusehatRecord(buildInput({ latestVitalSigns: buildVitals() }))).toEqual([]);
    });

    it('ignores a laboratory Observation, whose LOINC code is not a vital sign', () => {
      const actual = compareSatusehatRecord(
        buildInput({ held: [SATUSEHAT_READ_BACK_FIXTURES.Observation] }),
      );

      expect(actual).toEqual([]);
    });
  });

  describe('procedures', () => {
    it('matches a procedure SATUSEHAT holds under the same ICD-9-CM code', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          procedures: [
            {
              procedureId: 'procedure-1',
              code: '89.7',
              display: 'General physical examination',
              isCoded: true,
              performedAt: new Date(),
              notes: null,
            },
          ],
          held: [RECORDED_PROCEDURE],
        }),
      );

      expect(actual[0]).toMatchObject({ code: '89.7', outcome: 'MATCHES' });
    });

    /**
     * The doctor may see what the item was, and the fix is a code only the
     * clinic can add — so unlike the admin monitor, the item is named.
     */
    it('names an uncoded procedure as not sent, with its reason', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          procedures: [
            {
              procedureId: 'procedure-2',
              code: 'FREE_TEXT',
              display: 'Perawatan luka ringan',
              isCoded: false,
              performedAt: new Date(),
              notes: null,
            },
          ],
        }),
      );

      expect(actual).toEqual([
        {
          category: 'PROCEDURE',
          code: null,
          display: 'Perawatan luka ringan',
          ours: 'Perawatan luka ringan',
          satusehat: null,
          outcome: 'NOT_SENT',
          notSentReason: 'NO_ICD9CM_CODE',
        },
      ]);
    });
  });

  describe('medications', () => {
    it('matches a medication SATUSEHAT holds under the same KFA code', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          medications: [
            {
              medicationId: 'medication-1',
              code: 'OMZ20',
              kfaCode: '93020847',
              name: 'Omeprazole',
              unit: null,
            },
          ],
          held: [RECORDED_MEDICATION],
        }),
      );

      expect(actual).toEqual([
        expect.objectContaining({ category: 'MEDICATION', code: '93020847', outcome: 'MATCHES' }),
      ]);
    });

    it('names a medication with no KFA code as not sent, with its reason', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          medications: [
            {
              medicationId: 'medication-2',
              code: 'PARA500',
              kfaCode: null,
              name: 'Paracetamol 500 mg',
              unit: null,
            },
          ],
        }),
      );

      expect(actual[0]).toMatchObject({
        display: 'Paracetamol 500 mg',
        outcome: 'NOT_SENT',
        notSentReason: 'NO_KFA_CODE',
      });
    });

    it('lists a medication prescribed on several lines once', () => {
      const omeprazole = {
        medicationId: 'medication-1',
        code: 'OMZ20',
        kfaCode: '93020847',
        name: 'Omeprazole',
        unit: null,
      };
      const actual = compareSatusehatRecord(
        buildInput({ medications: [omeprazole, omeprazole], held: [RECORDED_MEDICATION] }),
      );

      expect(actual).toHaveLength(1);
    });
  });

  describe('lab results', () => {
    function buildLabItem(
      overrides: Partial<SatusehatLabReportItem> = {},
      resultOverrides: Partial<NonNullable<SatusehatLabReportItem['result']>> = {},
    ): SatusehatLabReportItem {
      return {
        labOrderItemId: 'item-1',
        itemSeq: 1,
        testName: 'Hemoglobin',
        loincCode: '718-7',
        loincDisplay: 'Hemoglobin',
        specimenId: 'specimen-1',
        result: {
          labResultId: 'result-1',
          valueNumeric: 13.2,
          valueText: null,
          valueCoded: null,
          unit: 'g/dL',
          refLow: null,
          refHigh: null,
          refText: null,
          flag: null,
          isAmendment: false,
          enteredAt: new Date(),
          ...resultOverrides,
        },
        ...overrides,
      };
    }

    function buildHeldLab(value: Partial<SatusehatHeldResource>): SatusehatHeldResource {
      return {
        resourceType: 'Observation',
        code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
        ...value,
      };
    }

    it('matches a numeric result SATUSEHAT holds with the same value', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          labItems: [buildLabItem()],
          held: [buildHeldLab({ valueQuantity: { value: 13.2, unit: 'g/dL' } })],
        }),
      );

      expect(actual).toEqual([
        {
          category: 'LAB_RESULT',
          code: '718-7',
          display: 'Hemoglobin',
          ours: '13.2 g/dL',
          satusehat: '13.2 g/dL',
          outcome: 'MATCHES',
          notSentReason: null,
        },
      ]);
    });

    /** The mapper sends a numeric result as `valueString` when its unit is not UCUM. */
    it('matches a numeric result SATUSEHAT holds as a string', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          labItems: [buildLabItem({}, { unit: null })],
          held: [buildHeldLab({ valueString: '13.20' } as Partial<SatusehatHeldResource>)],
        }),
      );

      expect(actual[0]).toMatchObject({ outcome: 'MATCHES', ours: '13.2', satusehat: '13.20' });
    });

    it('reports a different value as differing, showing both', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          labItems: [buildLabItem()],
          held: [buildHeldLab({ valueQuantity: { value: 11.8, unit: 'g/dL' } })],
        }),
      );

      expect(actual[0]).toMatchObject({
        ours: '13.2 g/dL',
        satusehat: '11.8 g/dL',
        outcome: 'DIFFERS',
      });
    });

    it('compares a coded result by its text, ignoring case', () => {
      const actual = compareSatusehatRecord(
        buildInput({
          labItems: [
            buildLabItem(
              { testName: 'HBsAg', loincCode: '5196-1' },
              { valueNumeric: null, valueCoded: 'Negatif', unit: null },
            ),
          ],
          held: [
            {
              resourceType: 'Observation',
              code: { coding: [{ system: 'http://loinc.org', code: '5196-1' }] },
              valueCodeableConcept: { text: 'negatif' },
            } as SatusehatHeldResource,
          ],
        }),
      );

      expect(actual[0]).toMatchObject({ code: '5196-1', outcome: 'MATCHES' });
    });

    it('names a test with no LOINC code as not sent', () => {
      const actual = compareSatusehatRecord(
        buildInput({ labItems: [buildLabItem({ loincCode: null })] }),
      );

      expect(actual[0]).toMatchObject({
        code: null,
        ours: '13.2 g/dL',
        outcome: 'NOT_SENT',
        notSentReason: 'NO_LOINC_CODE',
      });
    });

    it('names a test with no released result as not sent', () => {
      const actual = compareSatusehatRecord(
        buildInput({ labItems: [buildLabItem({ result: null })] }),
      );

      expect(actual[0]).toMatchObject({
        ours: null,
        outcome: 'NOT_SENT',
        notSentReason: 'NO_VERIFIED_RESULT',
      });
    });

    it('does not report a vital sign Observation as a lab result', () => {
      const actual = compareSatusehatRecord(buildInput({ held: [buildHeldVital('8480-6', 120)] }));

      expect(actual.every((line) => line.category !== 'LAB_RESULT')).toBe(true);
    });
  });

  it('orders lines diagnoses, vital signs, procedures, then medications', () => {
    const actual = compareSatusehatRecord(
      buildInput({
        diagnoses: [{ code: 'A90', display: 'Dengue', type: 'PRIMARY', recordedAt: new Date() }],
        latestVitalSigns: buildVitals({ pulseRate: 80 }),
        procedures: [
          {
            procedureId: 'procedure-1',
            code: '89.7',
            display: 'Exam',
            isCoded: true,
            performedAt: new Date(),
            notes: null,
          },
        ],
        medications: [
          { medicationId: 'medication-1', code: 'X', kfaCode: null, name: 'Racikan', unit: null },
        ],
      }),
    );

    expect(actual.map((line) => line.category)).toEqual([
      'DIAGNOSIS',
      'VITAL_SIGN',
      'PROCEDURE',
      'MEDICATION',
    ]);
  });

  it('ignores held resources whose shape it cannot read, rather than throwing', () => {
    const actual = compareSatusehatRecord(
      buildInput({
        held: [
          { resourceType: 'Condition', code: 'not-a-concept' },
          { resourceType: 'Condition', code: { coding: [{ code: 42 }] } },
          { resourceType: 'Observation', code: null, valueQuantity: 'x' },
        ],
      }),
    );

    expect(actual).toEqual([]);
  });
});
