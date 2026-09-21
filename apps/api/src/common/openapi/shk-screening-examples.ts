/**
 * Response examples for SHK screening (P25-T10). The baby is the acceptance
 * story's: born 1 October 2026 03:00 WIB (20:00 UTC the day before), so her
 * first sample is due 3 October 03:00 until 4 October 03:00 WIB.
 */
const SCREENING = {
  id: '3f4a5b6c-7d8e-4f9a-8b0c-1d2e3f4a5b6c',
  newbornCareRecordId: 'e9f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b',
  sequence: 1,
  status: 'DUE',
  dueFrom: '2026-10-02T20:00:00.000Z',
  dueUntil: '2026-10-03T20:00:00.000Z',
  sampleTakenAt: null,
  isEarly: false,
  sampleTakenByName: null,
  sentAt: null,
  laboratoryName: null,
  resultReceivedAt: null,
  result: null,
  notes: null,
  birthAt: '2026-09-30T20:00:00.000Z',
  motherPatientId: '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4',
  motherName: 'Rina Wulandari',
  newbornPatientId: null,
  newbornName: null,
  sex: 'FEMALE',
  attendantName: 'Bidan Siti Rahma, S.Tr.Keb.',
};

export const SHK_SCREENING_EXAMPLES = {
  screening: SCREENING,
  sampleRequest: { takenAt: '2026-10-03T01:30:00.000Z' },
  sentRequest: { sentAt: '2026-10-03T04:00:00.000Z', laboratoryName: 'Labkesda Provinsi' },
  resultRequest: {
    receivedAt: '2026-10-10T02:00:00.000Z',
    result: 'RECALL',
    notes: 'TSH 25 mU/L, ambil sampel konfirmasi',
  },
  taken: {
    ...SCREENING,
    status: 'TAKEN',
    sampleTakenAt: '2026-10-03T01:30:00.000Z',
    sampleTakenByName: 'Bidan Siti Rahma, S.Tr.Keb.',
  },
};
