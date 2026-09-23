import {
  CORETAX_FAKTUR_TEMPLATES,
  CoretaxFakturSourceInvoice,
  CoretaxFakturSourceLine,
  buildCoretaxFakturDocument,
  computeLineTax,
} from '@hms/shared-types';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORETAX_FAKTUR_XML_SERIALIZERS } from './coretax-faktur-xml-serializers';

const FIXTURE_DIRECTORY = join(__dirname, '../../../../test/fixtures/coretax');
const DJP_SAMPLE_PATH = join(FIXTURE_DIRECTORY, 'faktur-pk-sample-v1-4.xml');
const GOLDEN_PATH = join(FIXTURE_DIRECTORY, 'faktur-keluaran-v1-6-october-2026.golden.xml');
const CLINIC_NPWP = '0012345678901000';
const CLINIC_NITKU = '0012345678901000000000';
const TIME_ZONE = 'Asia/Jakarta';
const BARANG_RATE = { ratePercent: 12, dppNumerator: 11, dppDenominator: 12 };

/** A medicine line as P27-T04 snapshots it at issue: 12% × 11/12 carved out of the price. */
function buildMedicineLine(params: {
  description: string;
  quantity: number;
  amount: number;
}): CoretaxFakturSourceLine {
  const tax = computeLineTax({
    amount: params.amount,
    taxCode: {
      code: 'BARANG-PPN',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
    },
    rate: BARANG_RATE,
    isPkp: true,
  } as Parameters<typeof computeLineTax>[0]);
  return {
    itemType: 'MEDICATION',
    description: params.description,
    quantity: params.quantity,
    fakturTransactionCode: tax.fakturTransactionCode,
    taxableAmount: tax.taxableAmount,
    taxBase: tax.taxBase,
    taxRatePercent: tax.taxRatePercent,
    taxAmount: tax.taxAmount,
    coretaxItemCode: '000000',
    coretaxUnitCode: 'UM.0021',
    coretaxAdditionalInfo: null,
    coretaxFacilityStamp: null,
  };
}

/** An exempt jasa medis line: no PPN inside, the whole price is the DPP (kode 08). */
function buildConsultationLine(amount: number): CoretaxFakturSourceLine {
  return {
    itemType: 'CONSULTATION',
    description: 'Konsultasi dokter umum',
    quantity: 1,
    fakturTransactionCode: '08',
    taxableAmount: amount,
    taxBase: amount,
    taxRatePercent: 0,
    taxAmount: 0,
    coretaxItemCode: '000000',
    coretaxUnitCode: 'UM.0030',
    coretaxAdditionalInfo: 'TD.00510',
    coretaxFacilityStamp: 'TD.01110',
  };
}

function buildOctoberInvoices(): CoretaxFakturSourceInvoice[] {
  return [
    {
      invoiceId: 'invoice-1',
      invoiceNumber: 'INV-202610-0001',
      issuedAt: new Date('2026-10-05T03:00:00.000Z'),
      buyerName: 'Budi Santoso',
      buyerAddress: 'Jl. Merdeka No. 1, Jakarta',
      buyerNik: '3171000000000001',
      lines: [
        buildMedicineLine({ description: 'Amoxicillin 500 mg', quantity: 10, amount: 55_500 }),
        buildConsultationLine(150_000),
      ],
    },
    {
      invoiceId: 'invoice-2',
      invoiceNumber: 'INV-202610-0002',
      issuedAt: new Date('2026-10-20T10:00:00.000Z'),
      buyerName: 'Siti Aminah',
      buyerAddress: 'Jl. Sudirman No. 2, Jakarta',
      buyerNik: '3171000000000002',
      lines: [
        buildMedicineLine({ description: 'Paracetamol 500 mg', quantity: 7, amount: 12_000 }),
      ],
    },
    {
      invoiceId: 'invoice-3',
      invoiceNumber: 'INV-202610-0003',
      issuedAt: new Date('2026-10-21T10:00:00.000Z'),
      buyerName: 'Bayi Ny. Rina',
      buyerAddress: 'Jl. Kenanga No. 3, Jakarta',
      buyerNik: null,
      lines: [buildMedicineLine({ description: 'Vitamin K', quantity: 1, amount: 22_200 })],
    },
  ];
}

function buildOctoberXml(): string {
  const built = buildCoretaxFakturDocument({
    invoices: buildOctoberInvoices(),
    clinicNpwp: CLINIC_NPWP,
    clinicNitku: CLINIC_NITKU,
    timeZone: TIME_ZONE,
  });
  if (built.document === null) {
    throw new Error(`fixture should export: ${JSON.stringify(built.issues)}`);
  }
  return CORETAX_FAKTUR_XML_SERIALIZERS.V1_6(built.document);
}

/** The element names under the first `<parent>` of an XML text, in order, children excluded. */
function readChildNames(xml: string, parent: string, childBlock?: string): string[] {
  const body = new RegExp(`<${parent}(?:\\s[^>]*)?>([\\s\\S]*?)</${parent}>`).exec(xml)?.[1] ?? '';
  const flat = childBlock
    ? body.replace(new RegExp(`<${childBlock}>[\\s\\S]*?</${childBlock}>`), `<${childBlock}/>`)
    : body;
  return [...flat.matchAll(/<([A-Za-z]+)(?:\/>|>)/g)].map((match) => match[1] ?? '');
}

describe('Coretax Faktur Keluaran v1.6 export (P27-T09)', () => {
  const djpSample = readFileSync(DJP_SAMPLE_PATH, 'utf8');

  describe('given a finalized October PPN month with three invoices', () => {
    it('when exported, then the XML is byte-identical to the golden file', () => {
      const expectedXml = readFileSync(GOLDEN_PATH, 'utf8');
      const actualXml = buildOctoberXml();
      expect(actualXml).toBe(expectedXml);
    });

    it("then TaxInvoice and GoodService follow the element order of DJP's own sample", () => {
      const actualXml = buildOctoberXml();
      expect(readChildNames(actualXml, 'TaxInvoice', 'ListOfGoodService')).toEqual(
        readChildNames(djpSample, 'TaxInvoice', 'ListOfGoodService'),
      );
      expect(readChildNames(actualXml, 'GoodService')).toEqual(
        readChildNames(djpSample, 'GoodService'),
      );
      expect(readChildNames(actualXml, 'TaxInvoiceBulk', 'ListOfTaxInvoice')).toEqual(
        readChildNames(djpSample, 'TaxInvoiceBulk', 'ListOfTaxInvoice'),
      );
      expect(readChildNames(djpSample, 'TaxInvoiceBulk', 'ListOfTaxInvoice')).toEqual([
        'TIN',
        'ListOfTaxInvoice',
      ]);
    });

    it("then the declaration, root and layout are DJP's sample's", () => {
      const actualXml = buildOctoberXml();
      const [sampleDeclaration, sampleRoot] = djpSample.split('\n');
      const [actualDeclaration, actualRoot] = actualXml.split('\n');
      expect(actualDeclaration).toBe(sampleDeclaration);
      expect(actualRoot).toBe(sampleRoot);
      expect(actualXml.endsWith('</TaxInvoiceBulk>')).toBe(true);
      expect(actualXml).not.toContain('\r');
    });

    it('then one invoice with a medicine and a consultation becomes a kode-04 and a kode-08 faktur', () => {
      const actual = buildCoretaxFakturDocument({
        invoices: buildOctoberInvoices(),
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: CLINIC_NITKU,
        timeZone: TIME_ZONE,
      });
      expect(
        actual.document?.taxInvoices.map((faktur) => [faktur.refDesc, faktur.trxCode]),
      ).toEqual([
        ['INV-202610-0001', '04'],
        ['INV-202610-0001', '08'],
        ['INV-202610-0002', '04'],
      ]);
      expect(actual.digunggungInvoiceIds).toEqual(['invoice-3']);
    });

    it("then a kode-04 line's DPP is Qty × Price − Discount, to the cent, as the template computes it", () => {
      const actual = buildCoretaxFakturDocument({
        invoices: buildOctoberInvoices(),
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: CLINIC_NITKU,
        timeZone: TIME_ZONE,
      });
      actual.document?.taxInvoices
        .flatMap((faktur) => faktur.goodServices)
        .forEach((line) => {
          expect(Math.round((line.qty * line.price - line.totalDiscount) * 100) / 100).toBe(
            line.taxBase,
          );
          expect(line.totalDiscount).toBeGreaterThanOrEqual(0);
        });
    });

    const xmllint = spawnSync('xmllint', ['--version']);
    const itWhenXmllint = xmllint.status === 0 ? it : it.skip;
    itWhenXmllint('then the file is well-formed XML (xmllint)', () => {
      const result = spawnSync('xmllint', ['--noout', '-'], { input: buildOctoberXml() });
      expect(result.status).toBe(0);
    });
  });

  it('records where the v1.6 template came from', () => {
    const actualTemplate = CORETAX_FAKTUR_TEMPLATES.V1_6;
    expect(actualTemplate.sourceUrl).toBe(
      'https://pajak.go.id/sites/default/files/2026-01/ConverterEfakturCoretax__v1.6.zip',
    );
    expect(actualTemplate.publishedOn).toBe('2026-01-23');
  });

  describe('validation before download', () => {
    it('lists a line missing its item code, per invoice, and builds no document', () => {
      const inputInvoices = buildOctoberInvoices();
      const [first] = inputInvoices;
      const firstLine = first?.lines[0];
      if (first && firstLine) {
        first.lines[0] = { ...firstLine, coretaxItemCode: null };
      }
      const actual = buildCoretaxFakturDocument({
        invoices: inputInvoices,
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: CLINIC_NITKU,
        timeZone: TIME_ZONE,
      });
      expect(actual.document).toBeNull();
      expect(actual.issues).toEqual([
        expect.objectContaining({
          code: 'ITEM_CODE_MISSING',
          subjectId: 'invoice-1',
          subjectLabel: 'INV-202610-0001',
        }),
      ]);
    });

    it('lists the clinic identity, a missing unit and a kode-08 code without its facility', () => {
      const inputInvoices = buildOctoberInvoices();
      const [first] = inputInvoices;
      if (first) {
        first.lines = [
          { ...buildConsultationLine(150_000), coretaxFacilityStamp: null },
          {
            ...buildMedicineLine({ description: 'Amoxicillin', quantity: 1, amount: 11_100 }),
            coretaxUnitCode: null,
          },
        ];
      }
      const actual = buildCoretaxFakturDocument({
        invoices: inputInvoices,
        clinicNpwp: '001234567890100',
        clinicNitku: null,
        timeZone: TIME_ZONE,
      });
      expect(actual.issues.map((issue) => [issue.subjectId ?? 'clinic', issue.code])).toEqual([
        ['clinic', 'CLINIC_NPWP_INVALID'],
        ['clinic', 'CLINIC_NITKU_INVALID'],
        ['invoice-1', 'UNIT_CODE_MISSING'],
        ['invoice-1', 'FACILITY_MISSING'],
      ]);
    });
  });
});
