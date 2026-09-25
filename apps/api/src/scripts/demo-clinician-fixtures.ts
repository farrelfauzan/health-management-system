import { DemoClinicianFixture } from './seed-demo.types';

/**
 * The two practitioner profiles behind the DOCTOR and MIDWIFE logins.
 *
 * Every field the create-doctor form requires is filled, so neither login is
 * held on the complete-profile page (P20-T02). Licence numbers carry a `DEMO`
 * prefix — they identify the profile on a re-run and must never read as a
 * real SIP or STR. The NIKs are invented: they follow the KTP layout
 * (Tebet, Jakarta Selatan, then the birth date, then a `9xxx` serial) and are
 * checked in the spec against every SATUSEHAT sandbox identity in the repo.
 */
export const DEMO_CLINICIAN_FIXTURES: readonly DemoClinicianFixture[] = [
  {
    accountEmail: 'dokter@demo.salingjaga.com',
    profession: 'DOCTOR',
    fullName: 'Andi Pratama',
    titleCode: 'DR',
    licenseNumber: 'DEMO-SIP-DOKTER-001',
    specialtyName: 'General Practice',
    phoneNumber: '081200000101',
    nik: '3174011203809011',
    licenses: [
      { type: 'STR', licenseNumber: 'DEMO-STR-DOKTER-001', issuedAt: '2012-04-02' },
      {
        type: 'SIP',
        licenseNumber: 'DEMO-SIP-DOKTER-001',
        issuedAt: '2024-01-15',
        expiresAt: '2029-01-15',
      },
    ],
  },
  {
    accountEmail: 'bidan@demo.salingjaga.com',
    profession: 'MIDWIFE',
    fullName: 'Ayu Lestari',
    licenseNumber: 'DEMO-SIPB-BIDAN-001',
    specialtyName: 'Obstetrics & Gynecology',
    phoneNumber: '081200000102',
    nik: '3174016506909012',
    licenses: [
      { type: 'STR', licenseNumber: 'DEMO-STR-BIDAN-001', issuedAt: '2013-09-10' },
      {
        type: 'SIP',
        licenseNumber: 'DEMO-SIPB-BIDAN-001',
        issuedAt: '2024-03-01',
        expiresAt: '2029-03-01',
      },
    ],
  },
];
