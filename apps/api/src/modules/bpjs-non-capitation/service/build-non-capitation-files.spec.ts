import { NonCapitationRecapResponse } from '@hms/shared-types';

import { buildNonCapitationCsv } from './build-non-capitation-csv';
import { buildNonCapitationLetterHtml } from './build-non-capitation-letter-html';

const IDENTITY = {
  clinicName: 'Klinik <Bidan> Sehati',
  puskesmasName: null,
  puskesmasCode: null,
  address: 'Jl. Melati 1',
  phoneNumber: null,
};

function buildRecap(
  overrides: Partial<NonCapitationRecapResponse> = {},
): NonCapitationRecapResponse {
  return {
    month: '2026-10',
    monthLabel: 'Oktober 2026',
    clinicName: 'Klinik Bidan Sehati',
    generatedAt: '6 Nov 2026, 09.15',
    settings: {
      networkParentProviderCode: '0114U001',
      networkParentProviderName: 'Klinik Induk',
      isNetworkParentGovernmentOwned: false,
      hasOwnEclaimLogin: null,
      filingDayOfMonth: 10,
      isConfigured: true,
      updatedAt: null,
    },
    filingDeadline: '2026-11-10',
    daysUntilFilingDeadline: 4,
    lines: [
      {
        serviceType: 'DELIVERY_HEALTH_WORKER_TEAM',
        sourceId: 'delivery-1',
        serviceDate: '2026-10-02',
        patientId: 'mother-1',
        patientName: '=Siti',
        bpjsNumberLast4: '4821',
        visitLabel: null,
        examinerProfession: 'MIDWIFE',
        tariffAmount: 800000,
        regulationReference: 'Permenkes 3/2023 Pasal 20',
        documents: [
          { category: 'KIA_BOOK_COPY', isPresent: true },
          { category: 'PARTOGRAPH', isPresent: false },
        ],
        isDocumentationComplete: false,
        status: 'DUE_SOON',
        markedAt: null,
        expiresOn: '2027-04-02',
      },
    ],
    summary: [{ serviceType: 'DELIVERY_HEALTH_WORKER_TEAM', count: 1, totalAmount: 800000 }],
    totalAmount: 800000,
    unpricedCount: 0,
    statusCounts: { OPEN: 0, DUE_SOON: 1, LATE: 0, EXPIRED: 0, SENT: 0 },
    maximumCoachingFeeAmount: 80000,
    ...overrides,
  };
}

describe('Non-capitation recap files (P25-T16)', () => {
  it('writes the CSV with the masked BPJS number, the checklist and a neutralised formula', () => {
    const actualCsv = buildNonCapitationCsv(buildRecap());

    expect(actualCsv.startsWith('﻿')).toBe(true);
    expect(actualCsv).toContain('****4821');
    expect(actualCsv).toContain("'=Siti");
    expect(actualCsv).toContain('BELUM ADA: Salinan partograf');
    expect(actualCsv).toContain('Klinik Induk (0114U001)');
  });

  it('addresses the letter to the induk, escapes the letterhead and states the ceiling', () => {
    const actualHtml = buildNonCapitationLetterHtml(buildRecap(), IDENTITY);

    expect(actualHtml).toContain('Klinik &lt;Bidan&gt; Sehati');
    expect(actualHtml).toContain('Kepada Yth. Pimpinan Klinik Induk (kode FKTP 0114U001)');
    expect(actualHtml).toContain('paling banyak 10%');
    expect(actualHtml).toContain('10/11/2026');
  });

  it('warns instead of addressing when the induk is not configured', () => {
    const recap = buildRecap({
      settings: { ...buildRecap().settings, isConfigured: false },
      maximumCoachingFeeAmount: null,
    });

    const actualHtml = buildNonCapitationLetterHtml(recap, IDENTITY);

    expect(actualHtml).toContain('FKTP induk belum diatur');
    expect(actualHtml).not.toContain('Biaya pembinaan');
  });
});
