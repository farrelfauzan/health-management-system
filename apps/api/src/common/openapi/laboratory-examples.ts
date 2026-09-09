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
  fulfilmentSite: 'INTERNAL',
  chargeMode: 'CLINIC',
  recollectCount: 0,
  orderedAt: timestamp,
};

const labResultId = '77777777-dddd-4ddd-8ddd-777777777777';

const analystUserId = '88888888-eeee-4eee-8eee-888888888888';

const doctorUserId = '99999999-ffff-4fff-8fff-999999999999';

/**
 * A critical haemoglobin for an adult woman — the case the whole ticket is
 * shaped around: flagged on entry, telephoned before anybody signs it out.
 */
const labResult = {
  id: labResultId,
  labOrderItemId: labOrderItem.id,
  version: 1,
  valueNumeric: 6.8,
  unit: 'g/dL',
  refLow: 12,
  refHigh: 16,
  refCriticalLow: 7,
  refCriticalHigh: 20,
  flag: 'CRITICAL_LOW',
  enteredById: analystUserId,
  enteredAt: timestamp,
  verifiedUnderSingleOperator: false,
};

/**
 * Response and request examples for the laboratory catalog (`P18-T01`), its
 * orders (`P18-T02`), the specimens drawn for them (`P18-T03`) and the values
 * measured against them (`P18-T04`).
 */
const labReportDocumentId = '88888888-dddd-4ddd-8ddd-888888888888';

const labReportNote = 'Sampel lipemik, disarankan ulang setelah puasa 12 jam.';

const labReportVersion = {
  id: '77777777-eeee-4eee-8eee-777777777777',
  labOrderId,
  version: 1,
  status: 'READY',
  isAmended: false,
  releasedAt: timestamp,
  documentId: labReportDocumentId,
  attemptCount: 1,
  renderedAt: timestamp,
  pageCount: 1,
  requestedById: doctorUserId,
  note: labReportNote,
  createdAt: timestamp,
};

// Built without the READY-only keys rather than with them set to `undefined`:
// the schema inferrer turns an `undefined` value into `type: undefined`, which
// no OpenAPI parser accepts.
const labReportPendingVersion = {
  id: '99999999-eeee-4eee-8eee-999999999999',
  labOrderId,
  version: 2,
  status: 'PENDING',
  isAmended: true,
  releasedAt: timestamp,
  attemptCount: 1,
  nextAttemptAt: timestamp,
  lastError: 'Renderer unavailable: fetch failed',
  requestedById: doctorUserId,
  createdAt: timestamp,
};

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
    requestDocument: {
      documentId: '66666666-cccc-4ccc-8ccc-666666666666',
      kind: 'LAB_REQUEST',
      title: 'Surat pengantar laboratorium LAB/20260720/0001',
      printCount: 1,
      renderedAt: timestamp,
    },
    dispositionRequest: {
      fulfilmentSite: 'EXTERNAL',
      chargeMode: 'EXTERNAL',
      externalFacilityName: 'Laboratorium Prodia Kemang',
    },
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
  labResult: {
    view: labResult,
    released: {
      ...labResult,
      verifiedById: doctorUserId,
      verifiedAt: timestamp,
    },
    enterRequest: {
      items: [{ labOrderItemId: labOrderItem.id, valueNumeric: 6.8 }],
    },
    releaseRequest: { note: labReportNote },
    amendRequest: {
      valueNumeric: 8.6,
      reason: 'Salah ketik: 6.8 seharusnya 8.6, dikoreksi dari worksheet',
      note: 'Koreksi nilai Hb; entri sebelumnya tertukar dengan pasien lain.',
    },
    amended: {
      ...labResult,
      id: 'aaaaaaaa-dddd-4ddd-8ddd-aaaaaaaaaaaa',
      version: 2,
      valueNumeric: 8.6,
      flag: 'LOW',
      amendedFromId: labResultId,
      amendReason: 'Salah ketik: 6.8 seharusnya 8.6, dikoreksi dari worksheet',
      verifiedById: doctorUserId,
      verifiedAt: timestamp,
      verifiedUnderSingleOperator: true,
    },
    bench: {
      order: { ...labOrderHeader, status: 'IN_PROGRESS' },
      patient: worklistPatient,
      results: [labResult],
    },
    trendItem: {
      ...labResult,
      verifiedById: doctorUserId,
      verifiedAt: timestamp,
      labOrderId,
      orderNumber: labOrderHeader.orderNumber,
      testCode: 'HB',
      testName: 'Hemoglobin',
      resultType: 'NUMERIC',
      collectedAt: timestamp,
      releasedAt: timestamp,
    },
  },
  labReport: {
    version: labReportVersion,
    view: {
      labOrderId,
      current: labReportVersion,
      versions: [labReportPendingVersion, labReportVersion],
    },
    download: {
      documentId: labReportDocumentId,
      version: 1,
      isAmended: false,
      renderedAt: timestamp,
      fileName: 'hasil-lab-LAB-20260720-0001-v1.pdf',
      url: 'https://storage.example.com/lab-report/document/2026/07/abc.pdf?X-Amz-Signature=…',
      expiresAt: '2026-07-20T08:15:00.000Z',
    },
  },
  laboratorySettings: {
    view: {
      technicianMayVerify: false,
      singleOperator: false,
      updatedById: doctorUserId,
      updatedAt: timestamp,
    },
    updateRequest: { technicianMayVerify: true },
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
