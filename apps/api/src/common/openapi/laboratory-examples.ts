const labTestId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const labPanelId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const serviceTariffId = 'cccccccc-3333-4333-8333-cccccccccccc';
const timestamp = '2026-07-20T08:00:00.000Z';
const labOrderId = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const labSpecimenId = 'ffffffff-6666-4666-8666-ffffffffffff';
const encounterId = '11111111-7777-4777-8777-111111111111';
const patientId = '22222222-8888-4888-8888-222222222222';
const doctorId = '33333333-9999-4999-8999-333333333333';

const worklistPatient = {
  id: patientId,
  fullName: 'Siti Rahayu',
  mrn: 'MRN00000123',
  dateOfBirth: '1990-04-12',
  sex: 'FEMALE',
  ageYears: 36,
};

const labOrderItem = {
  id: '44444444-aaaa-4aaa-8aaa-444444444444',
  labTestId,
  code: 'HB',
  name: 'Hemoglobin',
  specimenType: 'WHOLE_BLOOD',
  resultType: 'NUMERIC',
  status: 'PENDING',
  panelId: labPanelId,
  panelName: 'Darah Rutin',
};

const labSpecimen = {
  id: labSpecimenId,
  labOrderId,
  specimenType: 'WHOLE_BLOOD',
  accessionNumber: 'SPC/20260720/0001',
  collectedAt: timestamp,
  collectedById: '55555555-bbbb-4bbb-8bbb-555555555555',
  status: 'COLLECTED',
};

const labOrderHeader = {
  id: labOrderId,
  orderNumber: 'LAB/20260720/0001',
  encounterId,
  patientId,
  orderedById: doctorId,
  orderedByName: 'dr. Andi Wijaya',
  status: 'ORDERED',
  priority: 'ROUTINE',
  clinicalNotes: 'Curiga anemia defisiensi besi',
  isFasting: false,
  recollectCount: 0,
  orderedAt: timestamp,
};

/**
 * Response and request examples for the laboratory catalog (`P18-T01`), its
 * orders (`P18-T02`) and the specimens drawn for them (`P18-T03`).
 */
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
  labOrder: {
    view: {
      ...labOrderHeader,
      items: [labOrderItem],
      specimens: [],
    },
    listItem: {
      ...labOrderHeader,
      itemCount: 6,
      patientName: worklistPatient.fullName,
      patientMrn: worklistPatient.mrn,
    },
    createRequest: {
      panelIds: [labPanelId],
      testIds: [labTestId],
      priority: 'ROUTINE',
      clinicalNotes: 'Curiga anemia defisiensi besi',
      isFasting: true,
    },
    cancelRequest: { reason: 'Pasien menolak pengambilan darah' },
    summary: {
      id: labOrderId,
      orderNumber: labOrderHeader.orderNumber,
      status: 'ORDERED',
      priority: 'ROUTINE',
      itemCount: 6,
      orderedAt: timestamp,
    },
  },
  labSpecimen: {
    view: labSpecimen,
    collectRequest: { collectedAt: timestamp, notes: 'Vena cubiti kanan' },
    rejectRequest: { reason: 'HEMOLYSED', notes: 'Sampel lisis, ambil ulang' },
    label: {
      accessionNumber: labSpecimen.accessionNumber,
      orderNumber: labOrderHeader.orderNumber,
      specimenType: 'WHOLE_BLOOD',
      collectedAt: timestamp,
      patient: worklistPatient,
    },
  },
  labWorklist: {
    item: {
      id: labOrderId,
      orderNumber: labOrderHeader.orderNumber,
      status: 'ORDERED',
      priority: 'URGENT',
      isFasting: true,
      recollectCount: 0,
      orderedAt: timestamp,
      clinicalNotes: 'Curiga anemia defisiensi besi',
      patient: worklistPatient,
      itemCount: 6,
      specimens: [],
      isAwaitingPayment: false,
    },
  },
} as const;
