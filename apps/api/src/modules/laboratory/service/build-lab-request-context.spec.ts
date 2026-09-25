import { LabOrderRecord, LabWorklistPatientRecord } from '@hms/shared-types';

import { buildLabRequestContext } from './build-lab-request-context';
import { resolveLabRequesterLabel } from './resolve-lab-requester-label';

/**
 * What the surat pengantar actually says. The letter is rendered from the order
 * rather than drafted, so these assertions are the guarantee that the two can
 * never disagree about which tests were requested.
 */
describe('buildLabRequestContext', () => {
  const timestamp = new Date('2026-07-20T08:00:00.000Z');

  const patient: LabWorklistPatientRecord = {
    id: 'patient-1',
    fullName: 'Arsyila Layla Safiya',
    mrn: '00000447',
    dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
    sex: 'FEMALE',
    bpjsNumberIndex: null,
  };

  const letterhead = {
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama',
    address: 'Jl. Merdeka No. 12',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
  };

  const signer = {
    fullName: 'dr. Yusuf Hidayat',
    profession: 'DOCTOR' as const,
    strNumber: 'KK00000000000001',
    practiceLicenses: [{ licenseNumber: 'SIP-2026-0005', expiresAt: null }],
  };

  function buildOrder(overrides: Partial<LabOrderRecord> = {}): LabOrderRecord {
    return {
      id: 'order-1',
      orderNumber: 'LAB/20260720/0001',
      encounterId: 'encounter-1',
      registrationId: 'registration-1',
      source: 'ENCOUNTER',
      patientId: 'patient-1',
      orderedById: 'doctor-1',
      orderedByName: 'dr. Yusuf Hidayat',
      externalRequesterName: null,
      externalRequesterFacility: null,
      status: 'ORDERED',
      priority: 'ROUTINE',
      clinicalNotes: 'Curiga infeksi saluran kemih',
      isFasting: false,
      fulfilmentSite: 'INTERNAL',
      chargeMode: 'CLINIC',
      externalFacilityName: null,
      recollectCount: 0,
      orderedAt: timestamp,
      cancelledAt: null,
      cancelReason: null,
      releasedAt: null,
      items: [
        {
          id: 'item-1',
          labTestId: 'test-1',
          code: 'URPROT',
          name: 'Urin - Protein',
          specimenType: 'URINE',
          resultType: 'CODED',
          status: 'PENDING',
          panelId: 'panel-1',
          panelName: 'Urin Rutin',
          specimenId: null,
        },
      ],
      specimens: [],
      ...overrides,
    };
  }

  function build(
    order: LabOrderRecord = buildOrder(),
    overrides: Partial<Parameters<typeof buildLabRequestContext>[0]> = {},
  ) {
    return buildLabRequestContext({
      order,
      patient,
      doctorName: resolveLabRequesterLabel(order),
      signer,
      letterhead,
      timeZone: 'Asia/Jakarta',
      issuedAt: timestamp,
      ...overrides,
    });
  }

  it('lists exactly the tests on the order, grouped under the panel they came from', () => {
    const actual = build();

    expect(actual.lines).toEqual([
      {
        'test.no': '1',
        'test.code': 'URPROT',
        'test.name': 'Urin - Protein',
        'test.panel': 'Urin Rutin',
        'test.specimen': 'Urin',
      },
    ]);
  });

  it('carries the order number as text and as a scannable barcode', () => {
    const actual = build();

    expect(actual.values['order.number']).toBe('LAB/20260720/0001');
    expect(actual.values['order.barcode']).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  // The SIP comes off the doctor's own licence row, so a renewal reaches every
  // future letter without anyone editing a template.
  it('signs the letter with the clinic identity and the doctor’s licence', () => {
    const actual = build();

    expect(actual.values['clinic.name']).toBe('Klinik Sehat Bersama');
    expect(actual.values['clinic.licenseNumber']).toBe('440/1234/DPMPTSP');
    expect(actual.values['clinic.phone']).toBe('(022) 1234567');
    expect(actual.values['clinic.logo']).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(actual.values['doctor.fullName']).toBe('dr. Yusuf Hidayat');
    expect(actual.values['doctor.signatureRole']).toBe('Dokter pemeriksa');
    expect(actual.values['doctor.licenseLabel']).toBe('SIP');
    expect(actual.values['doctor.licenseNumber']).toBe('SIP-2026-0005');
  });

  // D-032: the flat profile number is the STR. Labelling it "SIP" put a false
  // statement on every letter from a doctor with no practice licence on file.
  it('labels the flat profile number as the STR when no SIP is on file', () => {
    const actual = build(undefined, { signer: { ...signer, practiceLicenses: [] } });

    expect(actual.values['doctor.licenseLabel']).toBe('STR');
    expect(actual.values['doctor.licenseNumber']).toBe('KK00000000000001');
  });

  it('dates the letter by the clinic’s calendar, not by UTC', () => {
    const afterMidnightInJakarta = new Date('2026-07-20T17:30:00.000Z');

    const actual = build(undefined, { issuedAt: afterMidnightInJakarta });

    expect(actual.values['request.issuedAt']).toBe('21 Juli 2026');
    expect(actual.values['patient.dateOfBirth']).toBe('12 April 1990');
  });

  it('addresses an in-house order to the clinic’s own laboratory', () => {
    expect(build().values['order.destination']).toBe('Laboratorium Klinik Sehat Bersama');
  });

  // P18-T11. One template, two destinations: the referral out differs from the
  // in-house letter on this line and nothing else.
  it('addresses a referred-out order to the named facility', () => {
    const actual = build(
      buildOrder({
        fulfilmentSite: 'EXTERNAL',
        chargeMode: 'EXTERNAL',
        externalFacilityName: 'Laboratorium Prodia Kemang',
      }),
    );

    expect(actual.values['order.destination']).toBe('Laboratorium Prodia Kemang');
  });

  it('spells out the fasting instruction rather than printing a boolean', () => {
    expect(build(buildOrder({ isFasting: true })).values['order.isFasting']).toContain('berpuasa');
    expect(build().values['order.isFasting']).toBe('Tidak');
  });

  it('files the letter against the visit it was ordered on', () => {
    const actual = build();

    expect(actual.subjectId).toBe('order-1');
    expect(actual.encounterId).toBe('encounter-1');
    expect(actual.patientId).toBe('patient-1');
    expect(actual.title).toContain('LAB/20260720/0001');
  });
});
