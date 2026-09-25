import { DemoAccountFixture } from './seed-demo.types';

/**
 * The staff logins the demo signs in as, one per desk the clinic flow passes
 * through. Addresses sit on a demo subdomain so nobody mistakes them for a
 * real person's mailbox, and so they are found again by email on a re-run.
 */
export const DEMO_ACCOUNT_FIXTURES: readonly DemoAccountFixture[] = [
  {
    email: 'admin.klinik@demo.salingjaga.com',
    fullName: 'Rina Marlina',
    roleCode: 'ADMIN',
    purpose: 'front desk, check-in, opening the visit, cashier',
  },
  {
    email: 'dokter@demo.salingjaga.com',
    fullName: 'Andi Pratama',
    roleCode: 'DOCTOR',
    purpose: 'dokter umum: examination, orders, prescription, lab release, closing',
  },
  {
    email: 'bidan@demo.salingjaga.com',
    fullName: 'Ayu Lestari',
    roleCode: 'MIDWIFE',
    purpose: 'bidan: ANC and KB visits for the pregnant patient',
  },
  {
    email: 'lab@demo.salingjaga.com',
    fullName: 'Fajar Nugroho',
    roleCode: 'LAB_TECHNICIAN',
    purpose: 'specimen collection, receipt and result entry',
  },
  {
    email: 'apoteker@demo.salingjaga.com',
    fullName: 'Maya Sari',
    roleCode: 'PHARMACIST',
    purpose: 'dispensing and stock',
  },
];
