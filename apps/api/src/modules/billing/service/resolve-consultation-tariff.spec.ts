import { ConsultationTariffAudience, resolveConsultationTariff } from '@hms/shared-types';

describe('resolveConsultationTariff', () => {
  const midwiferySpecialtyId = '2e1b6a3d-4f5c-4d6e-9f70-8b9c0d1e2f30';
  const generalSpecialtyId = '1d0a5f2c-3e4b-4c5d-8e6f-7a8b9c0d1e2f';

  function buildTariff(
    code: string,
    audience: Partial<ConsultationTariffAudience> = {},
  ): ConsultationTariffAudience & { code: string } {
    return {
      code,
      specialtyId: audience.specialtyId ?? null,
      profession: audience.profession ?? null,
    };
  }

  const midwifeInMidwifery = {
    specialtyId: midwiferySpecialtyId,
    profession: 'MIDWIFE' as const,
  };

  it('prefers the row naming both the poli and the profession', () => {
    const inputCandidates = [
      buildTariff('FALLBACK'),
      buildTariff('BY-PROFESSION', { profession: 'MIDWIFE' }),
      buildTariff('BY-POLI', { specialtyId: midwiferySpecialtyId }),
      buildTariff('EXACT', { specialtyId: midwiferySpecialtyId, profession: 'MIDWIFE' }),
    ];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'MATCHED', tariff: inputCandidates[3] });
  });

  it('prefers a poli-specific row over one written for the profession anywhere', () => {
    const inputCandidates = [
      buildTariff('BY-PROFESSION', { profession: 'MIDWIFE' }),
      buildTariff('BY-POLI', { specialtyId: midwiferySpecialtyId }),
    ];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'MATCHED', tariff: inputCandidates[1] });
  });

  it('uses the profession row when no tariff names the poli', () => {
    const inputCandidates = [
      buildTariff('FALLBACK'),
      buildTariff('BY-PROFESSION', { profession: 'MIDWIFE' }),
    ];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'MATCHED', tariff: inputCandidates[1] });
  });

  it('ignores rows written for another poli or another profession', () => {
    const inputCandidates = [
      buildTariff('FALLBACK'),
      buildTariff('OTHER-POLI', { specialtyId: generalSpecialtyId }),
      buildTariff('OTHER-PROFESSION', { profession: 'DOCTOR' }),
    ];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'MATCHED', tariff: inputCandidates[0] });
  });

  it('reports no match rather than reaching for a tariff written for someone else', () => {
    const actualSelection = resolveConsultationTariff({
      candidates: [buildTariff('OTHER-POLI', { specialtyId: generalSpecialtyId })],
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'NONE' });
  });

  it('refuses to choose between two equally specific rows', () => {
    const inputCandidates = [buildTariff('FALLBACK-A'), buildTariff('FALLBACK-B')];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'AMBIGUOUS', tariffs: inputCandidates });
  });

  it('is unaffected by a rival that loses on specificity', () => {
    const inputCandidates = [
      buildTariff('FALLBACK-A'),
      buildTariff('FALLBACK-B'),
      buildTariff('BY-POLI', { specialtyId: midwiferySpecialtyId }),
    ];

    const actualSelection = resolveConsultationTariff({
      candidates: inputCandidates,
      audience: midwifeInMidwifery,
    });

    expect(actualSelection).toEqual({ outcome: 'MATCHED', tariff: inputCandidates[2] });
  });
});
