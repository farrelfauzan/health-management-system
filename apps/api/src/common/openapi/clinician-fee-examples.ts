import { optionalExample } from './api-endpoint.decorator';

const ruleId = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const tariffId = '4d2e3f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60';
const doctorId = '5e3f4a6b-7c8d-4e9f-a0b1-2c3d4e5f6a71';
const invoiceId = '6f4a5b7c-8d9e-4fa0-b1c2-3d4e5f6a7b82';
const entryId = '7a5b6c8d-9eaf-40b1-c2d3-4e5f6a7b8c93';
const timestamp = '2026-10-01T03:00:00.000Z';
const totals = { entryCount: 1, lineAmount: 150000, grossFee: 90000, clinicShare: 60000 };

/** Request and response examples for the P27-T06 jasa medis endpoints. */
export const CLINICIAN_FEE_EXAMPLES = {
  rules: {
    view: {
      id: ruleId,
      level: 'CLINICIAN_CATEGORY',
      serviceTariffId: optionalExample(tariffId),
      serviceTariffCode: optionalExample('KONS-UMUM'),
      serviceTariffName: optionalExample('Konsultasi dokter umum'),
      category: optionalExample('CONSULTATION'),
      doctorId: optionalExample(doctorId),
      doctorName: optionalExample('dr. Andi Pratama'),
      doctorProfession: optionalExample('DOCTOR'),
      mode: 'PERCENT',
      value: 60,
      effectiveFrom: '2026-10-01',
      effectiveTo: optionalExample('2026-12-31'),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    createRequest: {
      category: 'CONSULTATION',
      doctorId,
      mode: 'PERCENT',
      value: 60,
      effectiveFrom: '2026-10-01',
    },
    updateRequest: {
      mode: 'PERCENT',
      value: 65,
      effectiveFrom: '2026-10-01',
      effectiveTo: '2026-12-31',
    },
  },
  statements: {
    summary: {
      period: '2026-10',
      clinicians: [{ doctorId, doctorName: 'dr. Andi Pratama', profession: 'DOCTOR', totals }],
      totals,
    },
    statement: {
      period: '2026-10',
      doctorId,
      doctorName: 'dr. Andi Pratama',
      profession: 'DOCTOR',
      totals,
      entries: [
        {
          id: entryId,
          kind: 'ACCRUAL',
          invoiceId,
          invoiceNumber: 'INV/20261001/0001',
          description: 'Konsultasi dokter umum',
          itemType: 'CONSULTATION',
          quantity: 1,
          occurredAt: timestamp,
          ruleMode: 'PERCENT',
          ruleValue: 60,
          lineAmount: 150000,
          grossFee: 90000,
          clinicShare: 60000,
        },
      ],
    },
  },
};
