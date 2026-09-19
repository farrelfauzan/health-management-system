import { TaxReportPdfContext, TaxReportRecord } from '@hms/shared-types';

import { buildTaxReportPdfFooterHtml } from './build-tax-report-pdf-footer-html';
import { buildTaxReportPdfHtml } from './build-tax-report-pdf-html';
import { createTaxReportPdfFormatter } from './create-tax-report-pdf-formatter';

const format = createTaxReportPdfFormatter('Asia/Jakarta');

function buildPp55Report(overrides: Partial<TaxReportRecord> = {}): TaxReportRecord {
  return {
    id: 'report-feb',
    period: '2026-02',
    kind: 'PP55_OMZET',
    status: 'DRAFT',
    summary: {
      kind: 'PP55_OMZET',
      taxpayerType: 'INDIVIDUAL',
      ratePercent: 0.5,
      paymentCount: 1,
      yearToDateOmzetBefore: 300_000_000,
      nonTaxableAllowanceUsed: 200_000_000,
      totals: { grossOmzet: 400_000_000, taxableOmzet: 200_000_000, taxDue: 1_000_000 },
      taxAccountCode: '411128',
      depositTypeCode: '420',
      paymentDueDate: '2026-03-15',
      reportingDueDate: '2026-03-15',
    },
    lines: [
      {
        paymentId: 'pay-1',
        invoiceNumber: 'INV/20260210/0001',
        paidAt: '2026-02-10T04:00:00.000Z',
        method: 'CASH',
        amount: 400_000_000,
      },
    ],
    generatedAt: new Date('2026-03-02T01:00:00.000Z'),
    generatedById: 'user-1',
    finalizedAt: null,
    finalizedById: null,
    ...overrides,
  };
}

function buildPpnReport(): TaxReportRecord {
  const line = {
    invoiceId: 'inv-1',
    invoiceNumber: 'INV/20260905/0001',
    issuedAt: '2026-09-05T03:00:00.000Z',
    lineCount: 1,
  };
  return {
    ...buildPp55Report({ kind: 'PPN_OUTPUT', period: '2026-09' }),
    summary: {
      kind: 'PPN_OUTPUT',
      invoiceCount: 2,
      groups: [
        {
          fakturTransactionCode: '04',
          invoiceCount: 1,
          lineCount: 1,
          taxableAmount: 111_000,
          taxBase: 91_667,
          taxAmount: 11_000,
        },
        {
          fakturTransactionCode: '08',
          invoiceCount: 1,
          lineCount: 1,
          taxableAmount: 150_000,
          taxBase: 150_000,
          taxAmount: 0,
        },
      ],
      legacyLineCount: 1,
      legacyAmount: 75_000,
      notObjectLineCount: 0,
      notObjectAmount: 0,
      totals: { taxableAmount: 261_000, taxBase: 241_667, taxAmount: 11_000 },
      paymentDueDate: '2026-10-31',
      reportingDueDate: '2026-10-31',
    },
    lines: [
      {
        ...line,
        fakturTransactionCode: '04',
        taxableAmount: 111_000,
        taxBase: 91_667,
        taxAmount: 11_000,
      },
      {
        ...line,
        invoiceId: 'inv-2',
        invoiceNumber: 'INV/20260906/0002',
        fakturTransactionCode: '08',
        taxableAmount: 150_000,
        taxBase: 150_000,
        taxAmount: 0,
      },
      {
        ...line,
        invoiceId: 'inv-0',
        invoiceNumber: 'INV/20260901/0099',
        fakturTransactionCode: 'LEGACY',
        taxableAmount: 75_000,
        taxBase: 0,
        taxAmount: 0,
      },
    ],
  };
}

function buildContext(report: TaxReportRecord): TaxReportPdfContext {
  return {
    report,
    letterhead: {
      name: 'Klinik Sehat Bersama',
      legalName: 'dr. Sari Wulandari',
      address: 'Jl. Merdeka No. 12, Bandung',
      taxId: '0123456789012345',
      logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
    },
    nitku: '0123456789012345000000',
    actors: { generatedByName: 'admin@klinik.id', finalizedByName: null },
    renderedAt: new Date('2026-03-05T02:30:00.000Z'),
    timeZone: 'Asia/Jakarta',
  };
}

describe('tax report PDF layout (P27-T12)', () => {
  it('prints a DRAFT PP 55 report with the watermark and the totals of the summary to the rupiah', () => {
    const actual = buildTaxReportPdfHtml({ context: buildContext(buildPp55Report()), format });

    expect(actual).toContain('Draft Rekap PPh Final PP 55 — Februari 2026');
    expect(actual).toContain('class="watermark"');
    expect(actual).toContain('Dicetak 5 Maret 2026, 09:30');
    expect(actual).toContain('Rp 400.000.000');
    expect(actual).toContain('Rp 200.000.000');
    expect(actual).toContain('Rp 1.000.000');
    expect(actual).toContain('KAP 411128 / KJS 420');
    expect(actual).toContain('15 Maret 2026');
    expect(actual).toContain('NPWP: 0123456789012345 · NITKU: 0123456789012345000000');
    expect(actual).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('prints a finalized report without the watermark', () => {
    const finalized = buildPp55Report({
      status: 'FINALIZED',
      finalizedAt: new Date('2026-03-02T01:00:00.000Z'),
    });

    const actual = buildTaxReportPdfHtml({ context: buildContext(finalized), format });

    expect(actual).not.toContain('class="watermark"');
    expect(actual).toContain('<span class="status">FINAL</span>');
  });

  it('groups PPN by faktur code and keeps lines without a tax code in a section of their own', () => {
    const actual = buildTaxReportPdfHtml({ context: buildContext(buildPpnReport()), format });

    expect(actual).toContain('Draft Rekap PPN Keluaran — September 2026');
    const code04 = actual.indexOf('<h3>Kode faktur 04</h3>');
    const code08 = actual.indexOf('<h3>Kode faktur 08</h3>');
    const legacy = actual.indexOf('<h3>Tanpa kode pajak');
    expect([code04 > 0, code08 > code04, legacy > code08]).toEqual([true, true, true]);
    expect(actual.slice(legacy)).toContain('INV/20260901/0099');
    expect(actual).toContain('Rp 241.667');
    expect(actual).not.toContain('Bukan objek PPN — tidak masuk total');
  });

  it('prints hostile text as text and refuses a logo that is not an inline image', () => {
    const report = buildPp55Report();
    const context = buildContext(report);
    context.letterhead = {
      ...context.letterhead,
      name: '<script>alert(1)</script>',
      logoDataUri: 'https://evil.example/logo.png',
    };
    (report.lines[0] as { invoiceNumber: string }).invoiceNumber = '<b>INV</b>';

    const actual = buildTaxReportPdfHtml({ context, format });

    expect(actual).not.toContain('<script>');
    expect(actual).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(actual).toContain('&lt;b&gt;INV&lt;/b&gt;');
    expect(actual).not.toContain('evil.example');
  });

  it('puts the not-an-SPT line, who drafted and finalized it, and page x/y in the footer', () => {
    const finalized = buildPp55Report({
      status: 'FINALIZED',
      finalizedAt: new Date('2026-03-02T01:00:00.000Z'),
    });
    const context = buildContext(finalized);
    context.actors = { generatedByName: 'admin@klinik.id', finalizedByName: 'dr. Sari' };

    const actual = buildTaxReportPdfFooterHtml({ context, format });

    expect(actual).toContain('Dokumen kerja — bukan SPT. Setor dan laporkan melalui Coretax DJP.');
    expect(actual).toContain('Dihitung 2 Maret 2026, 08:00 oleh admin@klinik.id');
    expect(actual).toContain('Difinalkan 2 Maret 2026, 08:00 oleh dr. Sari');
    expect(actual).toContain('<span class="pageNumber"></span>/<span class="totalPages"></span>');
  });
});
