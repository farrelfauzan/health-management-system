import { ResolveInvoiceVariablesParams } from '@hms/shared-types';

/**
 * A 120-character name: long enough that a layout which does not wrap will
 * overlap its neighbour, which is exactly what the preview must reveal.
 */
const HOSTILE_PATIENT_NAME =
  'Raden Ayu Siti Rahmawati Kusumaningtyas binti Haji Muhammad Abdurrahman Wahid Prasetyo Nugroho Santoso Wijaya S.Pd M.Kes';

const FIXTURE_ITEM_COUNT = 12;

const ZERO_PRICE_ITEM_INDEX = 4;

const UNIT_PRICE_IDR = 475_000;

const FIXTURE_ISSUED_AT = new Date('2026-08-30T07:22:00.000Z');

const FIXTURE_DATE_OF_BIRTH = new Date('1988-02-04T00:00:00.000Z');

const FIXTURE_ENCOUNTER_AT = new Date('2026-08-30T02:10:00.000Z');

const FIXTURE_PAID_AT = new Date('2026-08-30T07:22:00.000Z');

/**
 * The hostile fixture the template preview renders against (`P16-T12`,
 * US-E1-04 / US-E1-06). Deliberately unpleasant: a 120-character patient
 * name, twelve line items so the table crosses a page break, one zero-price
 * item that must print `Rp 0` rather than blank, and a total above the
 * materai threshold so the stamp area shows. Code, not database — the
 * preview path issues no patient or invoice query, and nothing here is a
 * real person.
 */
export function buildInvoicePreviewFixture(timeZone: string): ResolveInvoiceVariablesParams {
  const items = buildFixtureItems();
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  return {
    timeZone,
    clinic: {
      name: 'Klinik Sehat Bersama',
      legalName: 'PT Sehat Bersama Indonesia',
      address: 'Jl. Merdeka No. 12, Bandung',
      phoneNumber: '(022) 1234567',
      email: 'halo@kliniksehat.id',
      licenseNumber: '440/1234/DPMPTSP',
      taxId: '01.234.567.8-901.000',
      logoDataUri: null,
    },
    invoice: {
      invoiceNumber: 'INV-PREVIEW-0001',
      status: 'PAID',
      totalAmount,
      issuedAt: FIXTURE_ISSUED_AT,
      qrVerifyDataUri: null,
    },
    patient: {
      fullName: HOSTILE_PATIENT_NAME,
      mrn: 'RM-000142',
      dateOfBirth: FIXTURE_DATE_OF_BIRTH,
      sex: 'FEMALE',
      address: 'Jl. Kenanga No. 3, Bandung',
      phoneNumber: '0812xxxxxx',
      nik: '••••••••••••3271',
    },
    encounter: {
      date: FIXTURE_ENCOUNTER_AT,
      doctorName: 'dr. Andi Prasetyo, Sp.PD',
      specialty: 'Penyakit Dalam',
    },
    admission: { roomLabel: 'Melati 2A', nights: 3 },
    payment: {
      method: 'QRIS',
      paidAt: FIXTURE_PAID_AT,
      referenceNumber: 'QR-88213771',
      cashierName: 'Rina Kartika',
    },
    items,
  };
}

function buildFixtureItems(): ResolveInvoiceVariablesParams['items'] {
  return Array.from({ length: FIXTURE_ITEM_COUNT }, (_value, index) => {
    const isZeroPriced = index === ZERO_PRICE_ITEM_INDEX;
    const unitPrice = isZeroPriced ? 0 : UNIT_PRICE_IDR;
    const quantity = 1;
    return {
      description: isZeroPriced
        ? 'Edukasi pasien dan keluarga (tanpa biaya)'
        : `Tindakan ${index + 1}: pemeriksaan dan perawatan lanjutan`,
      quantity,
      unitPrice,
      amount: unitPrice * quantity,
    };
  });
}
