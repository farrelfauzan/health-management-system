import {
  CORETAX_BP21_TEMPLATES,
  ClinicianTaxIdentityRecord,
  CoretaxBp21ClinicianSource,
  Pph21ReportLine,
  Pph21SourceClinicianFee,
  TaxReportRecord,
  buildCoretaxBp21Document,
  resolveTaxReportDueDates,
  summarizePph21Withholding,
} from '@hms/shared-types';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CORETAX_BP21_XML_SERIALIZERS } from './coretax-bp21-xml-serializers';

const FIXTURE_DIRECTORY = join(__dirname, '../../../../test/fixtures/coretax');
const XSD_PATH = join(FIXTURE_DIRECTORY, 'bp21-v4.xsd');
const GOLDEN_PATH = join(FIXTURE_DIRECTORY, 'bp21-v4-october-2026.golden.xml');
const CLINIC_NPWP = '0012345678901000';
const CLINIC_NITKU = '0012345678901000000000';
const DOCTOR_WITH_NPWP = '1a2b3c4d-0000-4000-8000-000000000001';
const DOCTOR_WITH_NIK = '2b3c4d5e-0000-4000-8000-000000000002';
const MIDWIFE = '3c4d5e6f-0000-4000-8000-000000000003';
const HPP_BRACKETS = [
  { id: 'b1', effectiveFrom: '2022-01-01', lowerBound: 0, upperBound: 60_000_000, ratePercent: 5 },
  {
    id: 'b2',
    effectiveFrom: '2022-01-01',
    lowerBound: 60_000_000,
    upperBound: 250_000_000,
    ratePercent: 15,
  },
  {
    id: 'b3',
    effectiveFrom: '2022-01-01',
    lowerBound: 250_000_000,
    upperBound: 500_000_000,
    ratePercent: 25,
  },
  {
    id: 'b4',
    effectiveFrom: '2022-01-01',
    lowerBound: 500_000_000,
    upperBound: 5_000_000_000,
    ratePercent: 30,
  },
  {
    id: 'b5',
    effectiveFrom: '2022-01-01',
    lowerBound: 5_000_000_000,
    upperBound: null,
    ratePercent: 35,
  },
];

function buildFee(doctorId: string, grossFee: number): Pph21SourceClinicianFee {
  return { doctorId, entryCount: 4, lineAmount: grossFee * 2, grossFee };
}

function buildIdentity(
  doctorId: string,
  overrides: Partial<ClinicianTaxIdentityRecord> = {},
): ClinicianTaxIdentityRecord {
  return {
    doctorId,
    fullName: `Clinician ${doctorId.slice(0, 4)}`,
    profession: 'DOCTOR',
    npwp: null,
    nikLast4: '0001',
    ...overrides,
  };
}

/** A finalized October 2026 PPh 21 month, computed by the real draft rules. */
function buildFinalizedOctober(fees: Pph21SourceClinicianFee[]): TaxReportRecord {
  const computed = summarizePph21Withholding({
    fees,
    identities: [
      buildIdentity(DOCTOR_WITH_NPWP, { npwp: '0987654321098765' }),
      buildIdentity(DOCTOR_WITH_NIK),
      buildIdentity(MIDWIFE, { profession: 'MIDWIFE', npwp: '0911122233344455' }),
    ],
    bracketSet: { effectiveFrom: '2022-01-01', brackets: HPP_BRACKETS },
    dueDates: resolveTaxReportDueDates('2026-10', 'PPH21_NON_EMPLOYEE'),
  });
  return {
    id: '7c6b5a4f-3e2d-4c1b-8a09-f8e7d6c5b4a3',
    period: '2026-10',
    kind: 'PPH21_NON_EMPLOYEE',
    status: 'FINALIZED',
    summary: computed.summary,
    lines: computed.lines,
    generatedAt: new Date('2026-11-02T02:00:00.000Z'),
    generatedById: 'admin',
    finalizedAt: new Date('2026-11-02T02:00:00.000Z'),
    finalizedById: 'admin',
  };
}

const THREE_CLINICIAN_FEES = [
  buildFee(DOCTOR_WITH_NPWP, 12_000_000),
  buildFee(DOCTOR_WITH_NIK, 150_000_000),
  buildFee(MIDWIFE, 3_750_000),
];

const COMPLETE_SOURCES: CoretaxBp21ClinicianSource[] = [
  { doctorId: DOCTOR_WITH_NPWP, taxIdentityNumber: '0987654321098765', ptkpStatus: 'K_1' },
  { doctorId: DOCTOR_WITH_NIK, taxIdentityNumber: '3171000000000001', ptkpStatus: 'TK_0' },
  { doctorId: MIDWIFE, taxIdentityNumber: '0911122233344455', ptkpStatus: 'K_0' },
];

/** Element names of one `xsd:complexType`'s sequence, in order, read from DJP's schema. */
function readSequence(xsd: string, typeName: string): string[] {
  const block = new RegExp(
    `<xsd:complexType name="${typeName}">([\\s\\S]*?)</xsd:complexType>`,
  ).exec(xsd)?.[1];
  return [...(block ?? '').matchAll(/<xsd:element name="([^"]+)"/g)].map((match) => match[1] ?? '');
}

function readEnumeration(xsd: string, typeName: string): string[] {
  const block = new RegExp(
    `<xsd:simpleType name="${typeName}"[^>]*>([\\s\\S]*?)</xsd:simpleType>`,
  ).exec(xsd)?.[1];
  return [...(block ?? '').matchAll(/<xsd:enumeration value="([^"]+)"/g)].map(
    (match) => match[1] ?? '',
  );
}

function readElementValues(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

function buildOctoberXml(): string {
  const built = buildCoretaxBp21Document({
    report: buildFinalizedOctober(THREE_CLINICIAN_FEES),
    clinicNpwp: CLINIC_NPWP,
    clinicNitku: CLINIC_NITKU,
    clinicians: COMPLETE_SOURCES,
  });
  if (built.document === null) {
    throw new Error(`fixture should export: ${JSON.stringify(built.issues)}`);
  }
  return CORETAX_BP21_XML_SERIALIZERS.V4(built.document);
}

describe('Coretax BP21 v4 export (P27-T08)', () => {
  const xsd = readFileSync(XSD_PATH, 'utf8');

  describe('given a finalized October draft with 3 clinicians', () => {
    it('when exported, then the XML is byte-identical to the golden file', () => {
      const expectedXml = readFileSync(GOLDEN_PATH, 'utf8');
      const actualXml = buildOctoberXml();
      expect(actualXml).toBe(expectedXml);
    });

    it("then every Bp21 follows the order of DJP's Bp21Type sequence", () => {
      const expectedOrder = readSequence(xsd, 'Bp21Type');
      const actualXml = buildOctoberXml();
      const firstLine = /<Bp21>([\s\S]*?)<\/Bp21>/.exec(actualXml)?.[1] ?? '';
      const actualOrder = [...firstLine.matchAll(/<([A-Za-z]+)>/g)].map((match) => match[1]);
      expect(expectedOrder).toHaveLength(15);
      expect(actualOrder).toEqual(expectedOrder);
    });

    it("then the root follows Bp21BulkType and the TIN matches DJP's TinType", () => {
      const actualXml = buildOctoberXml();
      expect(readSequence(xsd, 'Bp21BulkType')).toEqual(['TIN', 'ListOfBp21']);
      expect(readElementValues(actualXml, 'TIN')).toEqual([CLINIC_NPWP]);
      expect(xsd).toContain('<xsd:pattern value="[0-9]{15,16}"/>');
    });

    it("then PTKP, facility and document values are in the schema's enumerations", () => {
      const actualXml = buildOctoberXml();
      const ptkp = readEnumeration(xsd, 'PtkpType');
      const facility = readEnumeration(xsd, 'TaxCertificateType');
      const documents = readEnumeration(xsd, 'DocType');
      readElementValues(actualXml, 'StatusTaxExemption').forEach((value) =>
        expect(ptkp).toContain(value),
      );
      readElementValues(actualXml, 'TaxCertificate').forEach((value) =>
        expect(facility).toContain(value),
      );
      readElementValues(actualXml, 'Document').forEach((value) =>
        expect(documents).toContain(value),
      );
    });

    it('then Rate is the Pasal 17 bracket the DPP lands in, as the converter formula picks it', () => {
      const actualXml = buildOctoberXml();
      // DPP 6 jt → 5%; DPP 75 jt (gross 150 jt) → 15%; DPP 1.875 jt → 5%.
      expect(readElementValues(actualXml, 'Rate')).toEqual(['5', '15', '5']);
      expect(readElementValues(actualXml, 'Deemed')).toEqual(['50', '50', '50']);
    });

    const xmllint = spawnSync('xmllint', ['--version']);
    const itWhenXmllint = xmllint.status === 0 ? it : it.skip;
    itWhenXmllint("then it validates against DJP's own v4 schema (xmllint)", () => {
      const result = spawnSync('xmllint', ['--noout', '--schema', XSD_PATH, '-'], {
        input: buildOctoberXml(),
      });
      expect(result.stderr.toString()).toContain('- validates');
      expect(result.status).toBe(0);
    });
  });

  it('records where the v4 template came from', () => {
    const actualTemplate = CORETAX_BP21_TEMPLATES.V4;
    expect(actualTemplate.sourceUrl).toBe(
      'https://pajak.go.id/sites/default/files/2025-04/BP21%20Excel%20to%20XML%20v.4.xlsx',
    );
    expect(actualTemplate.publishedOn).toBe('2025-04-17');
    expect(xsd).toContain(actualTemplate.sha256);
  });

  describe('validation before download', () => {
    it('lists every problem at once, per clinician, and builds no document', () => {
      const inputSources: CoretaxBp21ClinicianSource[] = [
        { doctorId: DOCTOR_WITH_NPWP, taxIdentityNumber: '098765432109876', ptkpStatus: 'K_1' },
        { doctorId: DOCTOR_WITH_NIK, taxIdentityNumber: null, ptkpStatus: null },
        { doctorId: MIDWIFE, taxIdentityNumber: '0911122233344455', ptkpStatus: 'K_0' },
      ];
      const actual = buildCoretaxBp21Document({
        report: buildFinalizedOctober(THREE_CLINICIAN_FEES),
        clinicNpwp: '001234567890100',
        clinicNitku: null,
        clinicians: inputSources,
      });
      expect(actual.document).toBeNull();
      expect(actual.issues.map((issue) => [issue.subjectId ?? 'clinic', issue.code])).toEqual([
        ['clinic', 'CLINIC_NPWP_INVALID'],
        ['clinic', 'CLINIC_NITKU_INVALID'],
        [DOCTOR_WITH_NPWP, 'TAX_IDENTITY_NOT_16_DIGITS'],
        [DOCTOR_WITH_NIK, 'TAX_IDENTITY_MISSING'],
        [DOCTOR_WITH_NIK, 'PTKP_STATUS_MISSING'],
      ]);
    });

    it("refuses a NITKU that does not extend the clinic's NPWP", () => {
      const actual = buildCoretaxBp21Document({
        report: buildFinalizedOctober(THREE_CLINICIAN_FEES),
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: '9999999999999999000000',
        clinicians: COMPLETE_SOURCES,
      });
      expect(actual.issues.map((issue) => issue.code)).toEqual(['CLINIC_NITKU_INVALID']);
    });

    it('blocks a month that nets below zero and skips one that nets to exactly zero', () => {
      const report = buildFinalizedOctober([
        buildFee(DOCTOR_WITH_NPWP, 0),
        buildFee(DOCTOR_WITH_NIK, 150_000_000),
        buildFee(MIDWIFE, 3_750_000),
      ]);
      const negativeLine = { ...(report.lines[2] as Pph21ReportLine), grossFee: -150_000 };
      const actualSkipped = buildCoretaxBp21Document({
        report,
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: CLINIC_NITKU,
        clinicians: COMPLETE_SOURCES,
      });
      const actualNegative = buildCoretaxBp21Document({
        report: { ...report, lines: [...report.lines.slice(0, 2), negativeLine] },
        clinicNpwp: CLINIC_NPWP,
        clinicNitku: CLINIC_NITKU,
        clinicians: COMPLETE_SOURCES,
      });
      expect(actualSkipped.skippedDoctorIds).toEqual([DOCTOR_WITH_NPWP]);
      expect(actualSkipped.document?.lines.map((line) => line.doctorId)).toEqual([
        DOCTOR_WITH_NIK,
        MIDWIFE,
      ]);
      expect(actualNegative.issues.map((issue) => [issue.subjectId, issue.code])).toEqual([
        [MIDWIFE, 'GROSS_NOT_POSITIVE'],
      ]);
    });
  });
});
