import { KOHORT_IBU_COLUMNS } from '@hms/shared-types';

const HEADER = {
  clinicName: 'Klinik Bidan Sehati',
  puskesmasName: 'Puskesmas Cibeunying',
  puskesmasCode: 'P3273110201',
  month: '2026-10',
  monthLabel: 'Oktober 2026',
  generatedAt: '2026-11-02T01:15:00.000Z',
};

const KOHORT_IBU_ROW_VALUES = KOHORT_IBU_COLUMNS.map((column, index) => {
  if (index === 0) {
    return '1';
  }
  if (column.field === 'motherName') {
    return 'Siti Aminah';
  }
  if (column.field === 'visitOct') {
    return 'K1M';
  }
  return '';
});

/** Response examples for the KIA registers and monthly reports (P25-T15). */
export const MATERNAL_REPORT_EXAMPLES = {
  kohortRegister: {
    register: 'kohort-ibu',
    header: HEADER,
    villageCode: null,
    isProvisionalLayout: false,
    columns: KOHORT_IBU_COLUMNS.slice(0, 3),
    villages: [
      { code: '32.73.11.1001', name: 'Cihaurgeulis' },
      { code: null, name: 'Tanpa desa' },
    ],
    groups: [
      {
        villageCode: '32.73.11.1001',
        villageName: 'Cihaurgeulis',
        rows: [
          {
            id: '7c1d5e83-2a64-4f19-b8d3-91e4a6c05b72',
            villageCode: '32.73.11.1001',
            villageName: 'Cihaurgeulis',
            values: KOHORT_IBU_ROW_VALUES,
          },
        ],
      },
    ],
    totalRows: 1,
  },
  monthlyKia: {
    header: HEADER,
    isProvisionalLayout: true,
    indicators: [
      {
        id: 'k1',
        label: 'K1 (K1 akses + K1 murni)',
        definition: 'Kunjungan antenatal berkode K1A atau K1M yang dimulai pada bulan laporan.',
        value: 12,
      },
    ],
    antenatalLab: [
      {
        id: 'hbK1Examined',
        label: 'Diperiksa Hb K1',
        definition: 'Ibu hamil dengan hasil Hb pada kunjungan K1A/K1M bulan laporan.',
        value: 9,
      },
    ],
  },
  birthsDeaths: {
    header: HEADER,
    coverageNote:
      'Kematian di luar klinik tidak tercatat: laporan ini hanya memuat kelahiran yang dicatat klinik dan pasien yang meninggal selama dirawat.',
    summary: { liveBirths: 5, stillbirths: 1, maternalDeaths: 0, newbornDeaths: 1, otherDeaths: 0 },
    births: [
      {
        id: 'b2e7f409-6c13-4a85-9d27-5f8a0c3b1e69',
        birthAt: '2026-10-31T16:59:00.000Z',
        outcome: 'LIVE_BIRTH',
        sex: 'FEMALE',
        birthWeightGrams: 3100,
        motherName: 'Siti Aminah',
        villageName: 'Cihaurgeulis',
        attendantName: 'Bidan Sari, S.Tr.Keb.',
      },
    ],
    deaths: [
      {
        id: '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4',
        diedAt: '2026-10-12T03:20:00.000Z',
        patientKind: 'NEWBORN',
        patientName: 'Bayi Ny. Rina',
        ageLabel: '2 hari',
        villageName: null,
      },
    ],
  },
} as const;
