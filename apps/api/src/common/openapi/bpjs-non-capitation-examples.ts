const SETTINGS_VIEW = {
  networkParentProviderCode: '0114U001',
  networkParentProviderName: 'Klinik Pratama Induk Sejahtera',
  isNetworkParentGovernmentOwned: false,
  hasOwnEclaimLogin: null,
  filingDayOfMonth: 10,
  isConfigured: true,
  updatedAt: '2026-11-01T02:00:00.000Z',
};

const RECAP_LINE = {
  serviceType: 'ANTENATAL_MIDWIFE',
  sourceId: '6f1c2a90-3d4b-4c1e-9a55-2d7f0b8e1a01',
  serviceDate: '2026-10-14',
  patientId: '0b4d8f5e-7a2c-4e61-8d3b-5c9a1f2e6b02',
  patientName: 'Siti Aminah',
  bpjsNumberLast4: '4821',
  visitLabel: 'K2',
  examinerProfession: 'MIDWIFE',
  tariffAmount: 70000,
  regulationReference:
    'Permenkes 3/2023 Pasal 19 ayat (2) huruf c, hlm. 13 (ANC per kunjungan oleh bidan, termasuk bidan jejaring)',
  documents: [{ category: 'KIA_BOOK_COPY', isPresent: true }],
  isDocumentationComplete: true,
  status: 'DUE_SOON',
  markedAt: null,
  expiresOn: '2027-04-14',
};

const TARIFF_VIEW = {
  id: '9a7e5c3b-1f2d-4e6a-8b9c-0d1e2f3a4b05',
  serviceType: 'ANTENATAL_MIDWIFE',
  amount: 70000,
  validFrom: '2023-01-09',
  validUntil: null,
  regulationReference:
    'Permenkes 3/2023 Pasal 19 ayat (2) huruf c, hlm. 13 (ANC per kunjungan oleh bidan, termasuk bidan jejaring)',
};

/** Response and request examples for the BPJS non-capitation recap (P25-T16). */
export const BPJS_NON_CAPITATION_EXAMPLES = {
  settingsView: SETTINGS_VIEW,
  updateSettingsRequest: {
    networkParentProviderCode: '0114U001',
    networkParentProviderName: 'Klinik Pratama Induk Sejahtera',
    isNetworkParentGovernmentOwned: false,
    hasOwnEclaimLogin: null,
    filingDayOfMonth: 10,
  },
  tariffView: TARIFF_VIEW,
  createTariffRequest: {
    serviceType: 'ANTENATAL_MIDWIFE',
    amount: 75000,
    validFrom: '2027-01-01',
    regulationReference: 'Permenkes x/2027 Pasal 19 ayat (2) huruf c, hlm. 13',
  },
  recap: {
    month: '2026-10',
    monthLabel: 'Oktober 2026',
    clinicName: 'Klinik Bidan Sehati',
    generatedAt: '6 Nov 2026, 09.15',
    settings: SETTINGS_VIEW,
    filingDeadline: '2026-11-10',
    daysUntilFilingDeadline: 4,
    lines: [RECAP_LINE],
    summary: [{ serviceType: 'ANTENATAL_MIDWIFE', count: 1, totalAmount: 70000 }],
    totalAmount: 70000,
    unpricedCount: 0,
    statusCounts: { OPEN: 0, DUE_SOON: 1, LATE: 0, EXPIRED: 0, SENT: 0 },
    maximumCoachingFeeAmount: 7000,
  },
  markRequest: {
    month: '2026-10',
    items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: RECAP_LINE.sourceId }],
  },
  markResponse: {
    month: '2026-10',
    markedCount: 1,
    results: [
      { serviceType: 'ANTENATAL_MIDWIFE', sourceId: RECAP_LINE.sourceId, outcome: 'MARKED' },
    ],
  },
};
