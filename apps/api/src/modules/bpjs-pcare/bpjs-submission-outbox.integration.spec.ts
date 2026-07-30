import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EncounterRepository } from '../emr/repository/encounter.repository';
import { PharmacyFlowRepository } from '../pharmacy-flow/repository/pharmacy-flow.repository';
import { QueueNumberAllocatorRepository } from '../registration-flow/repository/queue-number-allocator.repository';
import { RegistrationFlowRepository } from '../registration-flow/repository/registration-flow.repository';

/**
 * The BPJS outbox guarantee no unit test can prove (P11-T05): a check-in and
 * its PENDAFTARAN row, a FINISHED close and its KUNJUNGAN row, and a
 * cancellation and its PENDAFTARAN_DELETE propagation all commit in one
 * transaction against real Postgres — and non-BPJS visits enqueue nothing.
 */
describe('BPJS submission outbox against Postgres', () => {
  let prisma: PrismaService;
  let registrationFlowRepository: RegistrationFlowRepository;
  let encounterRepository: EncounterRepository;
  let pharmacyFlowRepository: PharmacyFlowRepository;

  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdPrescriptionIds: string[] = [];
  const createdMedicationIds: string[] = [];
  let createdUserId: string | null = null;
  let specialtyId: string;
  let bpjsConfigId: string | null = null;
  let isConfigOwnedBySpec = false;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    registrationFlowRepository = new RegistrationFlowRepository(
      prisma,
      new QueueNumberAllocatorRepository(),
    );
    encounterRepository = new EncounterRepository(prisma);
    pharmacyFlowRepository = new PharmacyFlowRepository(prisma);
    const specialty = await prisma.specialty.create({
      data: { name: `BPJS Outbox Spec ${randomUUID()}` },
    });
    specialtyId = specialty.id;
    const existingConfig = await prisma.bpjsPcareConfig.findFirst({ where: { facilityId: null } });
    if (existingConfig === null) {
      const created = await prisma.bpjsPcareConfig.create({
        data: {
          facilityId: null,
          environment: 'DEVELOPMENT',
          consId: 'outbox-spec-cons',
          kdProviderPpk: '01000101',
          pcareUsername: 'outbox-spec',
          secretKeyCiphertext: 'spec-ciphertext',
          secretKeyLast4: 'spec',
          userKeyCiphertext: 'spec-ciphertext',
          userKeyLast4: 'spec',
          pcarePasswordCiphertext: 'spec-ciphertext',
        },
      });
      bpjsConfigId = created.id;
      isConfigOwnedBySpec = true;
    } else {
      bpjsConfigId = existingConfig.id;
    }
  });

  afterAll(async () => {
    await prisma.bpjsSubmission.deleteMany({
      where: { registrationId: { in: createdRegistrationIds } },
    });
    await prisma.satusehatSubmission.deleteMany({
      where: { encounterId: { in: createdEncounterIds } },
    });
    await prisma.dispenseItem.deleteMany({
      where: { dispenseRecord: { prescriptionId: { in: createdPrescriptionIds } } },
    });
    await prisma.dispenseRecord.deleteMany({
      where: { prescriptionId: { in: createdPrescriptionIds } },
    });
    await prisma.prescriptionMedication.deleteMany({
      where: { prescriptionId: { in: createdPrescriptionIds } },
    });
    await prisma.prescription.deleteMany({ where: { id: { in: createdPrescriptionIds } } });
    await prisma.medication.deleteMany({ where: { id: { in: createdMedicationIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: createdDoctorIds } } });
    await prisma.specialty.delete({ where: { id: specialtyId } });
    if (createdUserId !== null) {
      await prisma.user.delete({ where: { id: createdUserId } });
    }
    if (isConfigOwnedBySpec && bpjsConfigId !== null) {
      await prisma.bpjsPcareConfig.delete({ where: { id: bpjsConfigId } });
    }
    await prisma.$disconnect();
  });

  async function createPendingRegistration(options: {
    hasBpjsNumber: boolean;
  }): Promise<{ registrationId: string; patientId: string }> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `BPJSOB-${randomUUID().slice(0, 18)}`,
        fullName: 'BPJS Outbox Spec Patient',
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: '0800000000',
        address: 'Jl. Integrasi 2',
        ...(options.hasBpjsNumber ? { bpjsNumberCiphertext: 'spec-sealed-bpjs-number' } : {}),
      },
    });
    createdPatientIds.push(patient.id);
    const registration = await prisma.registration.create({
      data: { patientId: patient.id, status: 'PENDING' },
    });
    createdRegistrationIds.push(registration.id);
    return { registrationId: registration.id, patientId: patient.id };
  }

  async function findSubmissions(registrationId: string) {
    return prisma.bpjsSubmission.findMany({ where: { registrationId } });
  }

  it('enqueues the PENDAFTARAN row in the same transaction as a BPJS check-in', async () => {
    const { registrationId } = await createPendingRegistration({ hasBpjsNumber: true });

    await registrationFlowRepository.updateRegistration({
      id: registrationId,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });

    const submissions = await findSubmissions(registrationId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ type: 'PENDAFTARAN', status: 'PENDING', attempts: 0 });
  });

  it('enqueues nothing for a patient without a BPJS number', async () => {
    const { registrationId } = await createPendingRegistration({ hasBpjsNumber: false });

    await registrationFlowRepository.updateRegistration({
      id: registrationId,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });

    expect(await findSubmissions(registrationId)).toHaveLength(0);
  });

  it('enqueues the KUNJUNGAN row in the same transaction as a FINISHED close', async () => {
    const { registrationId, patientId } = await createPendingRegistration({ hasBpjsNumber: true });
    await registrationFlowRepository.updateRegistration({
      id: registrationId,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `BPJSOB-${randomUUID().slice(0, 18)}`,
        fullName: 'dr. BPJS Outbox Spec',
        specialtyId,
      },
    });
    createdDoctorIds.push(doctor.id);
    const encounter = await prisma.encounter.create({
      data: { registrationId, patientId, doctorId: doctor.id, status: 'IN_PROGRESS' },
    });
    createdEncounterIds.push(encounter.id);

    await encounterRepository.closeEncounter({
      id: encounter.id,
      registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    const submissions = await findSubmissions(registrationId);
    expect(submissions.map((submission) => submission.type).sort()).toEqual([
      'KUNJUNGAN',
      'PENDAFTARAN',
    ]);
  });

  it('propagates a cancellation as PENDAFTARAN_DELETE only after the pendaftaran was submitted', async () => {
    const submittedCase = await createPendingRegistration({ hasBpjsNumber: true });
    await registrationFlowRepository.updateRegistration({
      id: submittedCase.registrationId,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });
    await prisma.bpjsSubmission.update({
      where: {
        registrationId_type: {
          registrationId: submittedCase.registrationId,
          type: 'PENDAFTARAN',
        },
      },
      data: { status: 'SUBMITTED', bpjsReferenceNo: 'A12', submittedKdPoli: '001' },
    });

    await registrationFlowRepository.updateRegistration({
      id: submittedCase.registrationId,
      status: 'CANCELLED',
    });

    const submittedCaseRows = await findSubmissions(submittedCase.registrationId);
    expect(submittedCaseRows.map((submission) => submission.type).sort()).toEqual([
      'PENDAFTARAN',
      'PENDAFTARAN_DELETE',
    ]);

    const pendingCase = await createPendingRegistration({ hasBpjsNumber: true });
    await registrationFlowRepository.updateRegistration({
      id: pendingCase.registrationId,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });

    await registrationFlowRepository.updateRegistration({
      id: pendingCase.registrationId,
      status: 'CANCELLED',
    });

    const pendingCaseRows = await findSubmissions(pendingCase.registrationId);
    expect(pendingCaseRows.map((submission) => submission.type)).toEqual(['PENDAFTARAN']);
  });

  it('enqueues the OBAT row in the same transaction as an encounter-linked dispense', async () => {
    const { registrationId, patientId } = await createPendingRegistration({ hasBpjsNumber: true });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `BPJSOB-${randomUUID().slice(0, 18)}`,
        fullName: 'dr. BPJS Obat Spec',
        specialtyId,
      },
    });
    createdDoctorIds.push(doctor.id);
    const encounter = await prisma.encounter.create({
      data: { registrationId, patientId, doctorId: doctor.id, status: 'IN_PROGRESS' },
    });
    createdEncounterIds.push(encounter.id);
    const pharmacist = await prisma.user.create({
      data: {
        email: `bpjs-obat-spec-${randomUUID().slice(0, 8)}@example.com`,
        passwordHash: 'spec-hash',
      },
    });
    createdUserId = pharmacist.id;
    const medication = await prisma.medication.create({
      data: {
        code: `BPJSOB-${randomUUID().slice(0, 12)}`,
        name: 'Obat Spec Paracetamol',
      },
    });
    createdMedicationIds.push(medication.id);
    await prisma.medicationStockReceipt.create({
      data: {
        medicationId: medication.id,
        batchNumber: 'BPJS-OBAT-SPEC',
        expiryDate: new Date('2099-12-31T00:00:00.000Z'),
        quantity: 50,
        remainingQuantity: 50,
      },
    });
    const prescription = await prisma.prescription.create({
      data: {
        patientId,
        doctorId: doctor.id,
        encounterId: encounter.id,
        status: 'ISSUED',
        items: {
          create: [
            { medicationId: medication.id, dosage: '500 mg', frequency: '3x1', quantity: 10 },
          ],
        },
      },
    });
    createdPrescriptionIds.push(prescription.id);

    await pharmacyFlowRepository.createDispense({
      prescriptionId: prescription.id,
      pharmacistId: pharmacist.id,
      items: [{ medicationId: medication.id, quantity: 10 }],
      inventoryDate: new Date('2026-07-30T00:00:00.000Z'),
    });

    const submissions = await findSubmissions(registrationId);
    expect(submissions.map((submission) => submission.type)).toEqual(['OBAT']);
    expect(submissions[0]).toMatchObject({ status: 'PENDING', attempts: 0 });
  });
});
