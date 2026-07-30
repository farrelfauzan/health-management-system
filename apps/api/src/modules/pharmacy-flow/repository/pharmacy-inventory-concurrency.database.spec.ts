import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PharmacyFlowRepository } from './pharmacy-flow.repository';

describe('Pharmacy inventory concurrency against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: PharmacyFlowRepository;
  let patientId: string;
  let doctorId: string;
  let medicationId: string;
  let pharmacistId: string;
  let receiptId: string;
  const prescriptionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new PharmacyFlowRepository(prisma);

    const specialty = await prisma.specialty.create({
      data: { name: `Inventory Race ${randomUUID()}` },
    });
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `RACE-${randomUUID()}`,
        fullName: 'Inventory Race Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
      },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `RACE-${randomUUID()}`,
        fullName: 'Inventory Race Doctor',
        specialtyId: specialty.id,
      },
    });
    const pharmacist = await prisma.user.create({
      data: {
        email: `inventory-race-${randomUUID()}@example.com`,
        passwordHash: 'test-only',
      },
    });
    const medication = await prisma.medication.create({
      data: { code: `RACE-${randomUUID()}`, name: 'Inventory Race Medication' },
    });
    const receipt = await prisma.medicationStockReceipt.create({
      data: {
        medicationId: medication.id,
        batchNumber: 'RACE-LOT',
        expiryDate: new Date('2099-12-31T00:00:00Z'),
        quantity: 10,
        remainingQuantity: 10,
      },
    });
    const prescriptions = await Promise.all(
      [1, 2].map(() =>
        prisma.prescription.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            status: 'ISSUED',
            items: { create: { medicationId: medication.id, dosage: '1', frequency: '1', quantity: 7 } },
          },
        }),
      ),
    );

    patientId = patient.id;
    doctorId = doctor.id;
    medicationId = medication.id;
    pharmacistId = pharmacist.id;
    receiptId = receipt.id;
    prescriptionIds.push(...prescriptions.map((prescription) => prescription.id));
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.dispenseRecord.deleteMany({ where: { prescriptionId: { in: prescriptionIds } } });
    await prisma.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await prisma.medicationStockReceipt.deleteMany({ where: { medicationId } });
    await prisma.medication.delete({ where: { id: medicationId } });
    await prisma.user.delete({ where: { id: pharmacistId } });
    await prisma.doctorProfile.delete({ where: { id: doctorId } });
    await prisma.patientProfile.delete({ where: { id: patientId } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: 'Inventory Race ' } } });
    await prisma.$disconnect();
  });

  it('allows only one concurrent dispense to consume a ten-unit receipt', async () => {
    const results = await Promise.allSettled(
      prescriptionIds.map((prescriptionId) =>
        repository.createDispense({
          prescriptionId,
          pharmacistId,
          inventoryDate: new Date('2026-07-30T00:00:00Z'),
          items: [{ medicationId, quantity: 7 }],
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const receipt = await prisma.medicationStockReceipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: { allocations: true },
    });
    const dispenses = await prisma.dispenseRecord.findMany({
      where: { prescriptionId: { in: prescriptionIds } },
    });

    expect(receipt.remainingQuantity).toBe(3);
    expect(receipt.allocations).toHaveLength(1);
    expect(receipt.allocations[0]?.quantity).toBe(7);
    expect(dispenses).toHaveLength(1);
  });
});
