import { recordDeliverySchema, recordNewbornCareSchema } from '@hms/shared-types';

/**
 * P25-T09. The rules a delivery record refuses before anything reaches the
 * database — the ones a 422 naming the field answers better than a constraint
 * violation.
 *
 * What is *not* here matters as much: no rule refuses a clinical fact. A
 * grade 4 tear, a 900 ml blood loss and an APGAR of 1 all save, because a
 * record that will not accept what happened is a record that gets falsified.
 */
describe('the delivery record rules (P25-T09)', () => {
  function buildDelivery(overrides: Record<string, unknown> = {}) {
    return {
      attendantDoctorId: '58e9a316-40b2-4f4c-9207-2a58028babc4',
      birthAt: '2026-11-08T20:10:00.000Z',
      mode: 'SPONTANEOUS_VAGINAL',
      ...overrides,
    };
  }

  describe('the stages happen in order', () => {
    it('accepts a full kala I to IV in sequence', () => {
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({
          labourOnsetAt: '2026-11-08T18:40:00.000Z',
          fullDilatationAt: '2026-11-08T19:50:00.000Z',
          placentaDeliveredAt: '2026-11-08T20:22:00.000Z',
          postpartumMonitoringEndedAt: '2026-11-08T22:25:00.000Z',
        }),
      );

      expect(actual.success).toBe(true);
    });

    it('refuses a full dilatation before the onset of labour, naming the field', () => {
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({
          labourOnsetAt: '2026-11-08T19:50:00.000Z',
          fullDilatationAt: '2026-11-08T18:40:00.000Z',
        }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['fullDilatationAt']);
    });

    it('refuses a placenta delivered before the baby', () => {
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({ placentaDeliveredAt: '2026-11-08T19:00:00.000Z' }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['placentaDeliveredAt']);
    });

    it('accepts a birth with no recorded onset — she arrived pushing', () => {
      const actual = recordDeliverySchema.safeParse(buildDelivery({ labourOnsetAt: null }));

      expect(actual.success).toBe(true);
    });

    it('takes instants in UTC, as every other route in this API does', () => {
      // `z.string().datetime()` without `{ offset: true }` is the repo's
      // convention, so `+07:00` is refused here exactly as it is on the
      // encounter and laboratory routes. A birth at 03:10 WIB is sent as
      // 20:10Z the previous day, and the certificate renders it back in
      // clinic time.
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({ birthAt: '2026-11-09T03:10:00+07:00' }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['birthAt']);
    });
  });

  describe('a uterotonic is a drug and a time together', () => {
    it('refuses a medication with no time', () => {
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({ uterotonicMedicationId: '0f1e2d3c-4b5a-4697-8899-aabbccddeeff' }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['uterotonicGivenAt']);
    });

    it('refuses a time with no medication', () => {
      const actual = recordDeliverySchema.safeParse(
        buildDelivery({ uterotonicGivenAt: '2026-11-08T20:11:00.000Z' }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['uterotonicMedicationId']);
    });
  });

  it('records what happened, however bad — that is the point', () => {
    const actual = recordDeliverySchema.safeParse(
      buildDelivery({
        perinealTearGrade: 'GRADE_4',
        bloodLossMl: 900,
        referredOut: true,
        referralReason: 'RSUD Dr. Soetomo, perbaikan ruptur perineum derajat 4',
      }),
    );

    expect(actual.success).toBe(true);
  });

  describe('a baby carries one position, in one place', () => {
    function buildNewborn(overrides: Record<string, unknown> = {}) {
      return { outcome: 'LIVE_BIRTH', sex: 'FEMALE', ...overrides };
    }

    it("refuses a live baby carrying a stillbirth order — hers lives on her patient record", () => {
      const actual = recordNewbornCareSchema.safeParse(buildNewborn({ stillbirthOrder: 1 }));

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['stillbirthOrder']);
    });

    it('refuses a stillbirth with no position among the babies of this birth', () => {
      const actual = recordNewbornCareSchema.safeParse(buildNewborn({ outcome: 'STILLBIRTH' }));

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['stillbirthOrder']);
    });

    it('refuses a stillborn baby registered as a patient', () => {
      const actual = recordNewbornCareSchema.safeParse(
        buildNewborn({
          outcome: 'STILLBIRTH',
          stillbirthOrder: 2,
          newbornPatientId: '58e9a316-40b2-4f4c-9207-2a58028babc4',
        }),
      );

      expect(actual.success).toBe(false);
      expect(actual.error?.issues[0]?.path).toEqual(['newbornPatientId']);
    });

    it('accepts a stillborn second twin', () => {
      const actual = recordNewbornCareSchema.safeParse(
        buildNewborn({ outcome: 'STILLBIRTH', stillbirthOrder: 2, sex: 'MALE' }),
      );

      expect(actual.success).toBe(true);
    });

    it('accepts a live baby recorded before anyone has filled in her registration', () => {
      // The midwife records the first hour while it is happening; P24-T10's
      // form is filled in afterwards.
      const actual = recordNewbornCareSchema.safeParse(
        buildNewborn({ apgar1Min: 8, apgar5Min: 9, birthWeightGrams: 3200 }),
      );

      expect(actual.success).toBe(true);
      expect(actual.data?.newbornPatientId).toBeUndefined();
    });

    it('refuses an APGAR outside 0–10', () => {
      expect(recordNewbornCareSchema.safeParse(buildNewborn({ apgar1Min: 11 })).success).toBe(
        false,
      );
      expect(recordNewbornCareSchema.safeParse(buildNewborn({ apgar1Min: 0 })).success).toBe(true);
    });
  });
});
