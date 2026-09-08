import { LabResultRecord } from '@hms/shared-types';

import { buildLabReportContext } from './build-lab-report-context';

/**
 * The gathering step: which value is current, how a number and its band
 * print, and what the banner says. Every string on the sheet is decided here.
 */
describe('buildLabReportContext', () => {
  const releasedAt = new Date('2026-09-07T04:40:00.000Z');
  const collectedAt = new Date('2026-09-07T01:15:00.000Z');
  const itemId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const secondItemId = '55555555-aaaa-4aaa-8aaa-555555555555';

  const order = {
    id: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f',
    orderNumber: 'LAB/20260907/0001',
    encounterId: 'e1e2e3e4-5555-4555-8555-e1e2e3e4e5e6',
    patientId: '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002',
    orderedById: 'd1d2d3d4-6666-4666-8666-d1d2d3d4d5d6',
    orderedByName: 'dr. Andi Wijaya',
    status: 'RELEASED' as const,
    priority: 'ROUTINE' as const,
    clinicalNotes: null,
    isFasting: false,
    fulfilmentSite: 'INTERNAL' as const,
    chargeMode: 'CLINIC' as const,
    externalFacilityName: null,
    recollectCount: 0,
    orderedAt: new Date('2026-09-06T09:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    releasedAt,
    items: [
      {
        id: itemId,
        labTestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        code: 'HB',
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD' as const,
        resultType: 'NUMERIC' as const,
        status: 'RESULTED' as const,
        panelId: null,
        panelName: null,
        specimenId: 'ffffffff-6666-4666-8666-ffffffffffff',
      },
      {
        id: secondItemId,
        labTestId: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
        code: 'URPROT',
        name: 'Urin - Protein',
        specimenType: 'URINE' as const,
        resultType: 'CODED' as const,
        status: 'RESULTED' as const,
        panelId: null,
        panelName: null,
        specimenId: null,
      },
    ],
    specimens: [
      {
        id: 'ffffffff-6666-4666-8666-ffffffffffff',
        labOrderId: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f',
        specimenType: 'WHOLE_BLOOD' as const,
        accessionNumber: 'SPC/20260907/0001',
        collectedAt,
        collectedById: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f',
        receivedAt: null,
        status: 'COLLECTED' as const,
        rejectedAt: null,
        rejectReason: null,
        rejectNotes: null,
        notes: null,
      },
      {
        id: 'ffffffff-7777-4777-8777-ffffffffffff',
        labOrderId: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f',
        specimenType: 'URINE' as const,
        accessionNumber: 'SPC/20260907/0002',
        collectedAt: new Date('2026-09-07T00:50:00.000Z'),
        collectedById: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f',
        receivedAt: null,
        status: 'REJECTED' as const,
        rejectedAt: null,
        rejectReason: 'CONTAMINATED' as const,
        rejectNotes: null,
        notes: null,
      },
    ],
  };

  const patient = {
    id: order.patientId,
    fullName: 'Siti Rahayu',
    mrn: 'MRN00000123',
    dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
    sex: 'FEMALE' as const,
    bpjsNumberIndex: null,
  };

  function buildResult(overrides: Partial<LabResultRecord> = {}): LabResultRecord {
    return {
      id: '77777777-dddd-4ddd-8ddd-777777777777',
      labOrderItemId: itemId,
      version: 1,
      valueNumeric: 11.2,
      valueText: null,
      valueCoded: null,
      unit: 'g/dL',
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
      flag: 'LOW',
      enteredById: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f',
      enteredAt: releasedAt,
      verifiedById: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      verifiedAt: releasedAt,
      verifiedUnderSingleOperator: false,
      amendedFromId: null,
      amendReason: null,
      ...overrides,
    };
  }

  function build(overrides: Partial<Parameters<typeof buildLabReportContext>[0]> = {}) {
    return buildLabReportContext({
      order,
      patient,
      results: [
        buildResult(),
        buildResult({
          id: '77777777-dddd-4ddd-8ddd-777777777778',
          labOrderItemId: secondItemId,
          valueNumeric: null,
          valueCoded: 'Negatif',
          unit: null,
          refLow: null,
          refHigh: null,
          refText: 'Negatif',
          flag: 'NORMAL',
        }),
      ],
      clinic: {
        name: 'Klinik Sehat Bersama',
        legalName: null,
        address: 'Jl. Merdeka No. 12',
        phoneNumber: '(022) 1234567',
        email: null,
        licenseNumber: '440/1234',
        taxId: null,
        hasLogo: false,
        updatedAt: releasedAt.toISOString(),
      },
      clinicLogoDataUri: null,
      verifierName: 'dr. Andi Wijaya',
      releasedAt,
      supersededReleasedAt: null,
      timeZone: 'Asia/Jakarta',
      ...overrides,
    });
  }

  it('prints a number with a decimal comma, its unit, its marker and its band', () => {
    const actual = build();

    expect(actual.lines[0]).toEqual({
      'result.no': '1',
      'result.test': 'Hemoglobin',
      'result.value': '11,2',
      'result.unit': 'g/dL',
      'result.flag': '▼',
      'result.referenceRange': '12 – 16',
    });
  });

  it('prints a coded value against its normal text with no marker', () => {
    const actual = build();

    expect(actual.lines[1]).toEqual(
      expect.objectContaining({
        'result.value': 'Negatif',
        'result.flag': '',
        'result.referenceRange': 'Negatif',
      }),
    );
  });

  // The record holds the highest version. A sheet that printed v1 beside v2
  // would be two answers to one question.
  it('prints the current version of an amended value, not the superseded one', () => {
    const actual = build({
      results: [
        buildResult(),
        buildResult({ id: 'v2', version: 2, valueNumeric: 8.6, flag: 'LOW', amendedFromId: 'v1' }),
      ],
    });

    expect(actual.lines[0]?.['result.value']).toBe('8,6');
    expect(actual.lines).toHaveLength(2);
  });

  it('doubles the marker for a critical value', () => {
    const actual = build({ results: [buildResult({ valueNumeric: 6.8, flag: 'CRITICAL_LOW' })] });

    expect(actual.lines[0]?.['result.flag']).toBe('▼▼');
  });

  it('prints a dash where no band applied rather than leaving the cell blank', () => {
    const actual = build({
      results: [buildResult({ refLow: null, refHigh: null, refText: null, flag: null })],
    });

    expect(actual.lines[0]?.['result.referenceRange']).toBe('-');
    expect(actual.lines[0]?.['result.flag']).toBe('');
  });

  it('lists only the specimens that were not rejected, earliest draw first', () => {
    const actual = build();

    expect(actual.values['specimen.accessionNumbers']).toBe('SPC/20260907/0001');
    expect(actual.values['specimen.collectedAt']).toBe('7 September 2026, 08:15');
  });

  it('dates the sheet by the release in the clinic zone and names the verifier', () => {
    const actual = build();

    expect(actual.values['report.releasedAt']).toBe('7 September 2026, 11:40');
    expect(actual.values['report.verifierName']).toBe('dr. Andi Wijaya');
    expect(actual.values['patient.age']).toBe('36 tahun');
    expect(actual.values['report.amendmentNotice']).toBe('');
    expect(actual.title).toBe('Hasil laboratorium LAB/20260907/0001');
  });

  it('carries the AMENDED banner naming the release it replaces', () => {
    const actual = build({ supersededReleasedAt: new Date('2026-09-07T02:00:00.000Z') });

    expect(actual.values['report.amendmentNotice']).toBe(
      'AMENDED — menggantikan laporan tanggal 7 September 2026, 09:00',
    );
    expect(actual.title).toBe('Hasil laboratorium LAB/20260907/0001 (revisi)');
  });

  it('never carries the NIK', () => {
    const actual = build();

    expect(Object.keys(actual.values).some((token) => token.toLowerCase().includes('nik'))).toBe(
      false,
    );
  });
});
