import {
  ClinicalDocumentSignerRecord,
  ClinicalRequestRenderContext,
  ClinicLetterhead,
  LabOrderRecord,
  PrescriptionDetailRecord,
} from '@hms/shared-types';

import { buildLabRequestContext } from '../../laboratory/service/build-lab-request-context';
import { buildBirthCertificateValues } from '../../maternal-care/service/build-birth-certificate-values';
import { buildMaternalLetterValues } from '../../maternal-care/service/build-maternal-letter-values';
import { buildPrescriptionContext } from '../../pharmacy-flow/service/build-prescription-context';
import { buildClinicalRequestHtml } from './build-clinical-request-html';
import { BUILT_IN_CLINICAL_REQUEST_TEMPLATES } from './built-in-clinical-request-templates';

const EMPTY_TOKEN_PATTERN = /<span data-hms-var="([^"]+)"><\/span>/g;

function findEmptyTokens(html: string): string[] {
  return [...html.matchAll(EMPTY_TOKEN_PATTERN)].map((match) => match[1] ?? '');
}

function extractText(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<\/?(span|strong)[^>]*>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Every built-in clinical letter, filled by the builder its module really
 * uses, for a fully configured clinic. A token the builder forgot prints a
 * blank on paper a patient carries to another facility, and nobody notices
 * until it comes back — which is how the maternal letters came to print an
 * empty letterhead and an unsigned signature block. So the check is on the
 * rendered HTML, not on the builder's return value.
 */
describe('built-in clinical letters, rendered', () => {
  const issuedAt = new Date('2026-09-24T17:30:00.000Z');
  const timeZone = 'Asia/Jakarta';

  const letterhead: ClinicLetterhead = {
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama',
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
  };

  const midwife: ClinicalDocumentSignerRecord = {
    fullName: 'Siti Rahma, S.Tr.Keb.',
    profession: 'MIDWIFE',
    strNumber: 'BD00000000000002',
    practiceLicenses: [{ licenseNumber: 'SIPB/0042/2026', expiresAt: null }],
  };

  const doctor: ClinicalDocumentSignerRecord = {
    fullName: 'dr. Yusuf Hidayat',
    profession: 'DOCTOR',
    strNumber: 'KK00000000000001',
    practiceLicenses: [],
  };

  const letterPatient = {
    fullName: 'Rina Wijaya',
    mrn: '00000447',
    dateOfBirth: new Date('1995-04-12T00:00:00.000Z'),
    sex: 'FEMALE',
    address: 'Jl. Kenanga No. 3, Bandung',
    nikLast4: '3204',
  };

  const episode = {
    id: 'episode-1',
    patientId: 'patient-1',
    status: 'ACTIVE' as const,
    lastMenstrualPeriodDate: new Date('2026-02-02T00:00:00.000Z'),
    estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
    eddSource: 'LMP' as const,
    gravida: 2,
    para: 1,
    abortus: 0,
    prePregnancyWeightKg: null,
    bloodType: null,
    rhesus: null,
    riskNotes: null,
    endedAt: null,
    endReason: null,
    createdAt: issuedAt,
  };

  const labOrder: LabOrderRecord = {
    id: 'order-1',
    orderNumber: 'LAB/20260925/0001',
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
    clinicalNotes: 'Kontrol anemia kehamilan',
    isFasting: false,
    fulfilmentSite: 'INTERNAL',
    chargeMode: 'CLINIC',
    externalFacilityName: null,
    recollectCount: 0,
    orderedAt: issuedAt,
    cancelledAt: null,
    cancelReason: null,
    releasedAt: null,
    items: [
      {
        id: 'item-1',
        labTestId: 'test-1',
        code: 'HB',
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        status: 'PENDING',
        panelId: null,
        panelName: null,
        specimenId: null,
      },
    ],
    specimens: [],
  };

  const prescription: PrescriptionDetailRecord = {
    id: 'prescription-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    encounterId: 'encounter-1',
    status: 'ISSUED',
    fulfilmentSite: 'INTERNAL',
    chargeMode: 'CLINIC',
    externalFacilityName: null,
    issuedAt,
    notes: 'Diminum sampai habis',
    createdAt: issuedAt,
    updatedAt: issuedAt,
    patient: {
      id: 'patient-1',
      mrn: '00000447',
      fullName: 'Rina Wijaya',
      ownerUserId: null,
      dateOfBirth: new Date('1995-04-12T00:00:00.000Z'),
      sex: 'FEMALE',
    },
    doctor: {
      id: 'doctor-1',
      licenseNumber: 'KK00000000000001',
      fullName: 'dr. Yusuf Hidayat',
      ownerUserId: null,
    },
    items: [
      {
        id: 'line-1',
        medicationId: 'medication-1',
        dosage: '1 tablet',
        frequency: '1x sehari',
        durationDays: 30,
        quantity: 30,
        instructions: 'Sesudah makan',
        isCompound: false,
        compoundName: null,
        preparation: null,
        dosageUnit: null,
        medication: { id: 'medication-1', code: 'FE', name: 'Tablet Tambah Darah' },
        components: [],
      },
    ],
    dispenseRecords: [],
  };

  function buildContexts(): Record<ClinicalRequestRenderContext['kind'], ClinicalRequestRenderContext> {
    const maternalBase = {
      kind: 'REFERRAL_LETTER' as const,
      subjectId: 'visit-1',
      patientId: 'patient-1',
      encounterId: 'encounter-1',
      title: 'Surat Rujukan',
      lines: [],
    };
    return {
      LAB_REQUEST: buildLabRequestContext({
        order: labOrder,
        patient: {
          id: 'patient-1',
          fullName: 'Rina Wijaya',
          mrn: '00000447',
          dateOfBirth: new Date('1995-04-12T00:00:00.000Z'),
          sex: 'FEMALE',
          bpjsNumberIndex: null,
        },
        doctorName: 'dr. Yusuf Hidayat',
        signer: doctor,
        letterhead,
        timeZone,
        issuedAt,
      }),
      PRESCRIPTION: buildPrescriptionContext({
        prescription,
        patientDateOfBirth: prescription.patient.dateOfBirth,
        patientSex: prescription.patient.sex,
        letterhead,
        signer: doctor,
        timeZone,
      }),
      REFERRAL_LETTER: {
        ...maternalBase,
        values: buildMaternalLetterValues({
          patient: letterPatient,
          episode,
          asOf: issuedAt,
          examination: null,
          vitals: { systolicBloodPressure: 150, diastolicBloodPressure: 95 },
          triggeredRules: [],
          letterhead,
          signer: midwife,
          timeZone,
          destination: 'RSUD Kota Bandung — Poli Kebidanan',
          notes: 'Mohon penanganan lebih lanjut',
        }),
      },
      PREGNANCY_CERTIFICATE: {
        ...maternalBase,
        kind: 'PREGNANCY_CERTIFICATE',
        values: buildMaternalLetterValues({
          patient: letterPatient,
          episode,
          asOf: issuedAt,
          examination: null,
          vitals: { systolicBloodPressure: null, diastolicBloodPressure: null },
          triggeredRules: [],
          letterhead,
          signer: midwife,
          timeZone,
        }),
      },
      BIRTH_CERTIFICATE: {
        ...maternalBase,
        kind: 'BIRTH_CERTIFICATE',
        values: buildBirthCertificateValues({
          subject: {
            motherName: 'Rina Wijaya',
            motherNikLast4: '3204',
            babyName: 'Bayi Ny. Rina',
            sex: 'FEMALE',
            birthAt: new Date('2026-11-08T20:10:00.000Z'),
            birthWeightGrams: 3200,
            lengthCm: 49,
            birthOrder: 2,
            attendantName: 'Siti Rahma, S.Tr.Keb.',
            attendantStrNumber: 'BD00000000000002',
          },
          letterhead,
          timeZone,
        }),
      },
    };
  }

  function render(kind: ClinicalRequestRenderContext['kind']): string {
    const context = buildContexts()[kind];
    return buildClinicalRequestHtml({
      contentHtml: BUILT_IN_CLINICAL_REQUEST_TEMPLATES[kind].contentHtml,
      values: context.values,
      lines: context.lines,
    });
  }

  const kinds = [
    'LAB_REQUEST',
    'PRESCRIPTION',
    'REFERRAL_LETTER',
    'PREGNANCY_CERTIFICATE',
    'BIRTH_CERTIFICATE',
  ] as const;

  it.each(kinds)('the %s letter leaves no placeholder empty', (kind) => {
    expect(findEmptyTokens(render(kind))).toEqual([]);
  });

  it.each(kinds)('the %s letter prints no artefact of a missing value', (kind) => {
    const text = extractText(render(kind));

    expect(text).not.toMatch(/:\s*,/);
    expect(text).not.toMatch(/\bundefined\b|\bnull\b/);
  });

  it.each(kinds)('the %s letter opens with the clinic letterhead and its logo', (kind) => {
    const html = render(kind);

    expect(html).toContain('Klinik Sehat Bersama');
    expect(html).toContain('Jl. Merdeka No. 12, Bandung');
    expect(html).toContain('(022) 1234567');
    expect(html).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
  });

  // Issued at 00:30 WIB on 25 September: the clinic's day, not UTC's.
  it.each(['LAB_REQUEST', 'PRESCRIPTION', 'REFERRAL_LETTER', 'PREGNANCY_CERTIFICATE'] as const)(
    'the %s letter is dated by the clinic calendar',
    (kind) => {
      expect(extractText(render(kind))).toContain('25 September 2026');
    },
  );

  it('signs the surat rujukan as the midwife who issued it, under her SIPB', () => {
    const text = extractText(render('REFERRAL_LETTER'));

    expect(text).toContain('Bidan pemeriksa,');
    expect(text).toContain('Siti Rahma, S.Tr.Keb.');
    expect(text).toContain('SIPB: SIPB/0042/2026');
    expect(text).not.toContain('Dokter pemeriksa');
  });

  // D-032: with no SIP on file the number is the STR and says so.
  it('labels a doctor’s flat licence number as the STR on the resep', () => {
    const text = extractText(render('PRESCRIPTION'));

    expect(text).toContain('Dokter pemeriksa,');
    expect(text).toContain('STR: KK00000000000001');
    expect(text).not.toContain('SIP:');
  });

  it('prints the place of birth as the clinic’s name and address', () => {
    const text = extractText(render('BIRTH_CERTIFICATE'));

    expect(text).toContain('Klinik Sehat Bersama, Jl. Merdeka No. 12, Bandung');
    expect(text).toContain('Senin, 9 November 2026');
  });
});
