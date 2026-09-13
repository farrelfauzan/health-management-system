import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { MrnAllocatorRepository } from '../../common/mrn/mrn-allocator.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrivacyNoticeRepository } from '../../common/privacy-notice/privacy-notice.repository';
import { DoctorManagementRepository } from '../doctor-management/repository/doctor-management.repository';
import { PatientManagementRepository } from '../patient-management/repository/patient-management.repository';

/**
 * D-035 against real Postgres: a NIK change must not keep the SATUSEHAT link
 * derived from the old one, for doctors *and* patients.
 *
 * This needs a real database rather than a mock, because the whole rule turns on
 * a comparison of **blind indexes** written by the encryption service. A mocked
 * repository would happily agree with whatever the test asserted; only real
 * round trips prove that re-saving the same NIK produces the same index (and so
 * does not unlink) while a different NIK produces a different one.
 *
 * The misattribution this prevents is silent: a typo corrected at the counter
 * would otherwise keep sending that patient's visits to a stranger's national
 * record.
 */
describe('SATUSEHAT link clearing on NIK change against Postgres', () => {
  let prisma: PrismaService;
  let doctorRepository: DoctorManagementRepository;
  let patientRepository: PatientManagementRepository;

  const createdDoctorIds: string[] = [];
  const createdPatientIds: string[] = [];
  let specialtyId: string;

  /** A NIK-shaped value unique to this run, so parallel runs cannot collide. */
  function buildNik(): string {
    return randomUUID().replace(/\D/g, '').padEnd(16, '7').slice(0, 16);
  }

  async function createLinkedDoctor(nik: string): Promise<string> {
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `NIKC-${randomUUID().slice(0, 18)}`,
        fullName: 'dr. Unlink Spec',
        specialtyId,
        phoneNumber: '0800000000',
        satusehatPractitionerId: 'ihs-practitioner-original',
      },
    });
    createdDoctorIds.push(doctor.id);
    await doctorRepository.updateDoctor(doctor.id, { nik });
    // The write above clears nothing: the doctor had no NIK, so there was no
    // change. Re-assert the link in case a future change to that path alters it.
    await prisma.doctorProfile.update({
      where: { id: doctor.id },
      data: { satusehatPractitionerId: 'ihs-practitioner-original' },
    });
    return doctor.id;
  }

  async function createLinkedPatient(nik: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `NIKC-${randomUUID().slice(0, 18)}`,
        fullName: 'Unlink Spec Patient',
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: '0800000000',
        address: 'Jl. Unlink 1',
      },
    });
    createdPatientIds.push(patient.id);
    await patientRepository.updatePatient(patient.id, { nik });
    await prisma.patientProfile.update({
      where: { id: patient.id },
      data: {
        satusehatPatientIdCiphertext: 'ciphertext-original',
        satusehatPatientIdKeyVersion: 1,
        satusehatPatientIdLast4: '5538',
      },
    });
    return patient.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const crypto = new NationalIdentifierCryptoService(new ConfigService());
    doctorRepository = new DoctorManagementRepository(prisma, crypto);
    const configService = new ConfigService();
    patientRepository = new PatientManagementRepository(
      prisma,
      crypto,
      new MrnAllocatorRepository(configService),
      new PrivacyNoticeRepository(prisma),
    );
    const specialty = await prisma.specialty.create({
      data: { name: `Unlink Spec ${randomUUID()}` },
    });
    specialtyId = specialty.id;
  });

  afterAll(async () => {
    if (createdDoctorIds.length > 0) {
      await prisma.doctorProfile.deleteMany({ where: { id: { in: createdDoctorIds } } });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (specialtyId) {
      await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    }
    await prisma.$disconnect();
  });

  describe('doctors', () => {
    it('clears the practitioner link when the NIK changes', async () => {
      const doctorId = await createLinkedDoctor(buildNik());

      const result = await doctorRepository.updateDoctor(doctorId, { nik: buildNik() });

      expect(result.clearedSatusehatLink).toBe(true);
      const stored = await prisma.doctorProfile.findUnique({
        where: { id: doctorId },
        select: { satusehatPractitionerId: true },
      });
      expect(stored?.satusehatPractitionerId).toBeNull();
    });

    it('keeps the link when the same NIK is saved again', async () => {
      const nik = buildNik();
      const doctorId = await createLinkedDoctor(nik);

      const result = await doctorRepository.updateDoctor(doctorId, { nik });

      expect(result.clearedSatusehatLink).toBe(false);
      const stored = await prisma.doctorProfile.findUnique({
        where: { id: doctorId },
        select: { satusehatPractitionerId: true },
      });
      expect(stored?.satusehatPractitionerId).toBe('ihs-practitioner-original');
    });

    it('keeps the link when an unrelated field changes', async () => {
      const doctorId = await createLinkedDoctor(buildNik());

      const result = await doctorRepository.updateDoctor(doctorId, { fullName: 'dr. Renamed' });

      expect(result.clearedSatusehatLink).toBe(false);
      const stored = await prisma.doctorProfile.findUnique({
        where: { id: doctorId },
        select: { satusehatPractitionerId: true, fullName: true },
      });
      expect(stored?.satusehatPractitionerId).toBe('ihs-practitioner-original');
      expect(stored?.fullName).toBe('dr. Renamed');
    });

    it('lets a verified manual link survive the NIK change that accompanies it', async () => {
      const doctorId = await createLinkedDoctor(buildNik());

      // P21-T08 sends both: the operator confirmed this pairing against the
      // platform, so it must not be undone by the NIK arriving with it.
      const result = await doctorRepository.updateDoctor(doctorId, {
        nik: buildNik(),
        satusehatPractitionerId: 'ihs-practitioner-verified',
      });

      expect(result.clearedSatusehatLink).toBe(true);
      const stored = await prisma.doctorProfile.findUnique({
        where: { id: doctorId },
        select: { satusehatPractitionerId: true },
      });
      expect(stored?.satusehatPractitionerId).toBe('ihs-practitioner-verified');
    });
  });

  describe('patients', () => {
    it('clears the patient link when the NIK changes', async () => {
      const patientId = await createLinkedPatient(buildNik());

      const result = await patientRepository.updatePatient(patientId, { nik: buildNik() });

      expect(result.clearedSatusehatLink).toBe(true);
      const stored = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        select: {
          satusehatPatientIdCiphertext: true,
          satusehatPatientIdKeyVersion: true,
          satusehatPatientIdLast4: true,
        },
      });
      expect(stored).toMatchObject({
        satusehatPatientIdCiphertext: null,
        satusehatPatientIdKeyVersion: null,
        satusehatPatientIdLast4: null,
      });
    });

    it('clears the patient link when the NIK is cleared to null', async () => {
      const patientId = await createLinkedPatient(buildNik());

      const result = await patientRepository.updatePatient(patientId, { nik: null });

      expect(result.clearedSatusehatLink).toBe(true);
      const stored = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        select: { satusehatPatientIdCiphertext: true, nikIndex: true },
      });
      expect(stored?.satusehatPatientIdCiphertext).toBeNull();
      expect(stored?.nikIndex).toBeNull();
    });

    it('keeps the patient link when the same NIK is saved again', async () => {
      const nik = buildNik();
      const patientId = await createLinkedPatient(nik);

      const result = await patientRepository.updatePatient(patientId, { nik });

      expect(result.clearedSatusehatLink).toBe(false);
      const stored = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        select: { satusehatPatientIdCiphertext: true },
      });
      expect(stored?.satusehatPatientIdCiphertext).toBe('ciphertext-original');
    });

    it('keeps the patient link when an unrelated field changes', async () => {
      const patientId = await createLinkedPatient(buildNik());

      const result = await patientRepository.updatePatient(patientId, { address: 'Jl. Baru 2' });

      expect(result.clearedSatusehatLink).toBe(false);
      const stored = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        select: { satusehatPatientIdCiphertext: true },
      });
      expect(stored?.satusehatPatientIdCiphertext).toBe('ciphertext-original');
    });

    it('reports no clearing for a patient that was never linked', async () => {
      const patient = await prisma.patientProfile.create({
        data: {
          sex: 'MALE',
          mrn: `NIKC-${randomUUID().slice(0, 18)}`,
          fullName: 'Never Linked',
          dateOfBirth: new Date('1990-01-01'),
          phoneNumber: '0800000000',
          address: 'Jl. Unlink 3',
        },
      });
      createdPatientIds.push(patient.id);

      const result = await patientRepository.updatePatient(patient.id, { nik: buildNik() });

      expect(result.clearedSatusehatLink).toBe(false);
    });
  });
});
