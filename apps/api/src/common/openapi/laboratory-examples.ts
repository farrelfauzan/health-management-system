const labTestId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const labPanelId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const serviceTariffId = 'cccccccc-3333-4333-8333-cccccccccccc';
const timestamp = '2026-07-20T08:00:00.000Z';

/** Response and request examples for the laboratory catalog (`P18-T01`). */
export const LABORATORY_EXAMPLES = {
  labTest: {
    view: {
      id: labTestId,
      code: 'HB',
      name: 'Hemoglobin',
      loincCode: '718-7',
      loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
      specimenType: 'WHOLE_BLOOD',
      resultType: 'NUMERIC',
      unit: 'g/dL',
      decimals: 1,
      codedOptions: [],
      isActive: true,
      serviceTariffId,
      price: 35000,
      referenceRanges: [
        {
          id: 'dddddddd-4444-4444-8444-dddddddddddd',
          sex: 'MALE',
          low: 13.2,
          high: 17.3,
          criticalLow: 7,
          criticalHigh: 20,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    createRequest: {
      code: 'HB',
      name: 'Hemoglobin',
      loincCode: '718-7',
      loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
      specimenType: 'WHOLE_BLOOD',
      resultType: 'NUMERIC',
      unit: 'g/dL',
      decimals: 1,
      serviceTariffId,
    },
    updateRequest: { name: 'Hemoglobin (Hb)', isActive: true },
    replaceRangesRequest: {
      ranges: [
        { sex: 'MALE', low: 13.2, high: 17.3, criticalLow: 7, criticalHigh: 20 },
        { sex: 'FEMALE', low: 11.7, high: 15.5, criticalLow: 7, criticalHigh: 20 },
      ],
    },
  },
  labPanel: {
    view: {
      id: labPanelId,
      code: 'DARAH-RUTIN',
      name: 'Darah Rutin',
      isActive: true,
      serviceTariffId,
      price: 120000,
      members: [
        {
          labTestId,
          code: 'HB',
          name: 'Hemoglobin',
          specimenType: 'WHOLE_BLOOD',
          resultType: 'NUMERIC',
          sortOrder: 1,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    createRequest: {
      code: 'DARAH-RUTIN',
      name: 'Darah Rutin',
      serviceTariffId,
      labTestIds: [labTestId],
    },
    updateRequest: { name: 'Darah Rutin (CBC)' },
  },
} as const;
