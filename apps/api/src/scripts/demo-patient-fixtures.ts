import { DemoPatientFixture } from './seed-demo.types';

/**
 * Six invented patients covering the stories a klinik demo tells: an adult
 * of each sex for the general consultation, a pregnant woman for the bidan
 * flow, two older patients for chronic-care follow-up and a young adult.
 *
 * Every identifier is fictional. The NIKs follow the KTP layout — Tebet,
 * Jakarta Selatan (`317401`), the birth date as `DDMMYY` with 40 added to the
 * day for women, then a `9xxx` serial — so they pass the same validation and
 * demographic cross-check a real registration does, and the spec proves none
 * of them is a SATUSEHAT sandbox identity. Phone numbers use a `0812-0000`
 * block and emails the demo subdomain. A re-run finds each patient again by
 * the NIK's blind index.
 */
export const DEMO_PATIENT_FIXTURES: readonly DemoPatientFixture[] = [
  {
    fullName: 'Budi Santoso',
    dateOfBirth: '1985-05-15',
    sex: 'MALE',
    nik: '3174011505859001',
    phoneNumber: '081200000001',
    email: 'budi.santoso@demo.salingjaga.com',
    address: 'Jl. Tebet Barat Dalam Raya No. 12',
    villageCode: '31.74.01.1003',
    maritalStatus: 'MARRIED',
    occupation: 'Karyawan Swasta',
    clinicianProfessions: ['DOCTOR'],
    scenario: 'adult male, general consultation with lab and prescription',
  },
  {
    fullName: 'Siti Rahmawati',
    dateOfBirth: '1988-08-21',
    sex: 'FEMALE',
    nik: '3174016108889002',
    phoneNumber: '081200000002',
    email: 'siti.rahmawati@demo.salingjaga.com',
    address: 'Jl. Kebon Baru Utara No. 7',
    villageCode: '31.74.01.1004',
    maritalStatus: 'MARRIED',
    occupation: 'Guru',
    clinicianProfessions: ['DOCTOR'],
    scenario: 'adult female, general consultation',
  },
  {
    fullName: 'Dewi Anggraini',
    dateOfBirth: '1996-03-12',
    sex: 'FEMALE',
    nik: '3174015203969003',
    phoneNumber: '081200000003',
    email: 'dewi.anggraini@demo.salingjaga.com',
    address: 'Jl. Bukit Duri Tanjakan No. 21',
    villageCode: '31.74.01.1005',
    maritalStatus: 'MARRIED',
    occupation: 'Ibu Rumah Tangga',
    clinicianProfessions: ['DOCTOR', 'MIDWIFE'],
    scenario: 'pregnant woman, bidan ANC flow (also assigned to the doctor)',
  },
  {
    fullName: 'Slamet Riyadi',
    dateOfBirth: '1950-11-02',
    sex: 'MALE',
    nik: '3174010211509004',
    phoneNumber: '081200000004',
    email: 'slamet.riyadi@demo.salingjaga.com',
    address: 'Jl. Manggarai Utara II No. 3',
    villageCode: '31.74.01.1007',
    maritalStatus: 'WIDOWED',
    occupation: 'Pensiunan',
    clinicianProfessions: ['DOCTOR'],
    scenario: 'elderly male, chronic-care follow-up',
  },
  {
    fullName: 'Rizky Firmansyah',
    dateOfBirth: '2001-01-30',
    sex: 'MALE',
    nik: '3174013001019005',
    phoneNumber: '081200000005',
    email: 'rizky.firmansyah@demo.salingjaga.com',
    address: 'Jl. Menteng Dalam No. 45',
    villageCode: '31.74.01.1003',
    maritalStatus: 'SINGLE',
    occupation: 'Mahasiswa',
    clinicianProfessions: ['DOCTOR'],
    scenario: 'young adult male, acute visit',
  },
  {
    fullName: 'Sri Wahyuni',
    dateOfBirth: '1958-07-09',
    sex: 'FEMALE',
    nik: '3174014907589006',
    phoneNumber: '081200000006',
    email: 'sri.wahyuni@demo.salingjaga.com',
    address: 'Jl. Manggarai Selatan VI No. 9',
    villageCode: '31.74.01.1006',
    maritalStatus: 'MARRIED',
    occupation: 'Pedagang',
    clinicianProfessions: ['DOCTOR'],
    scenario: 'elderly female, hypertension and diabetes follow-up',
  },
];
