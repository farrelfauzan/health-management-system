import {
  CreateDispenseRecordPayload,
  CreateMedicationRecordPayload,
  CreatePrescriptionRecordPayload,
  ListMedicationsParams,
  ListPrescriptionsParams,
  resolvePrescriptionStatusAfterDispense,
  UpdateMedicationRecordPayload,
} from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { Prisma } from '../../../generated/prisma/client';
import { MedicationIdentifierConflictError } from './medication-identifier-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const MEDICATION_PROJECTION_SELECT = {
  id: true,
  code: true,
  name: true,
} satisfies Prisma.MedicationSelect;

const PRESCRIPTION_DETAIL_INCLUDE = {
  patient: {
    select: {
      id: true,
      mrn: true,
      fullName: true,
      ownerUserId: true,
    },
  },
  doctor: {
    select: {
      id: true,
      licenseNumber: true,
      fullName: true,
      ownerUserId: true,
    },
  },
  items: {
    include: {
      medication: {
        select: MEDICATION_PROJECTION_SELECT,
      },
    },
  },
  dispenseRecords: {
    where: {
      status: 'DISPENSED' as const,
    },
    select: {
      id: true,
      status: true,
      items: {
        select: {
          medicationId: true,
          quantity: true,
        },
      },
    },
  },
} satisfies Prisma.PrescriptionInclude;

const DISPENSE_DETAIL_INCLUDE = {
  items: {
    include: {
      medication: {
        select: MEDICATION_PROJECTION_SELECT,
      },
    },
  },
  prescription: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.DispenseRecordInclude;

function isUniqueConstraintErrorOn(err: unknown, target: string): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidate = err as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== UNIQUE_CONSTRAINT_ERROR_CODE) {
    return false;
  }
  const targets = candidate.meta?.target;
  if (Array.isArray(targets)) {
    return targets.includes(target);
  }
  return typeof targets === 'string' && targets.includes(target);
}

/**
 * Translates the database-level uniqueness race — two concurrent writes with the
 * same catalog or KFA code both passing the service pre-check — into the same
 * conflict the pre-check raises. The KFA variants are matched first because
 * `kfa_code` contains `code` as a substring.
 */
function rethrowMedicationIdentifierConflict(err: unknown): never {
  if (
    isUniqueConstraintErrorOn(err, 'kfa_code') ||
    isUniqueConstraintErrorOn(err, 'kfaCode') ||
    isUniqueConstraintErrorOn(err, 'medications_kfa_code_key')
  ) {
    throw new MedicationIdentifierConflictError('kfaCode');
  }
  if (isUniqueConstraintErrorOn(err, 'code')) {
    throw new MedicationIdentifierConflictError('code');
  }
  throw err;
}

@Injectable()
export class PharmacyFlowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listMedications(params: ListMedicationsParams) {
    const { page, limit, search, category } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search, mode: 'insensitive' as const } },
              { kfaCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const medications = await this.prisma.findManyActive(tx.medication, {
        where,
        skip,
        take: limit,
        orderBy: {
          name: 'asc',
        },
      });

      const count = await this.prisma.countActive(tx.medication, { where });

      return [medications, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async listPrescriptions(params: ListPrescriptionsParams) {
    const { page, limit, status, patientId, doctorId, ownerUserId } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(ownerUserId
        ? {
            OR: [{ patient: { ownerUserId } }, { doctor: { ownerUserId } }],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const prescriptions = await this.prisma.findManyActive(tx.prescription, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: PRESCRIPTION_DETAIL_INCLUDE,
      });

      const count = await this.prisma.countActive(tx.prescription, { where });

      return [prescriptions, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findMedicationById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.medication, {
      where: {
        id,
      },
    });
  }

  async findMedicationByCode(code: string) {
    return this.prisma.findFirstActive(this.prisma.medication, {
      where: {
        code,
      },
      select: {
        id: true,
      },
    });
  }

  async findMedicationByKfaCode(kfaCode: string) {
    return this.prisma.findFirstActive(this.prisma.medication, {
      where: {
        kfaCode,
      },
      select: {
        id: true,
      },
    });
  }

  async createMedication(payload: CreateMedicationRecordPayload) {
    return this.prisma.medication
      .create({
        data: {
          code: payload.code,
          kfaCode: payload.kfaCode ?? null,
          name: payload.name,
          form: payload.form ?? null,
          strength: payload.strength ?? null,
          unit: payload.unit ?? null,
          category: payload.category ?? null,
          stockQty: payload.stockQty,
        },
      })
      .catch(rethrowMedicationIdentifierConflict);
  }

  async updateMedication(id: string, payload: UpdateMedicationRecordPayload) {
    return this.prisma.medication
      .update({
        where: {
          id,
        },
        data: {
          ...(payload.code !== undefined ? { code: payload.code } : {}),
          ...(payload.kfaCode !== undefined ? { kfaCode: payload.kfaCode } : {}),
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.form !== undefined ? { form: payload.form } : {}),
          ...(payload.strength !== undefined ? { strength: payload.strength } : {}),
          ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
          ...(payload.category !== undefined ? { category: payload.category } : {}),
          ...(payload.stockQty !== undefined ? { stockQty: payload.stockQty } : {}),
        },
      })
      .catch(rethrowMedicationIdentifierConflict);
  }

  async findActiveMedicationsByIds(medicationIds: string[]) {
    return this.prisma.findManyActive(this.prisma.medication, {
      where: {
        id: {
          in: medicationIds,
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        stockQty: true,
      },
    });
  }

  async findActivePatientById(id: string) {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });
  }

  async findActiveDoctorById(id: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });
  }

  async findActiveDoctorByOwnerUserId(ownerUserId: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        ownerUserId,
        isActive: true,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });
  }

  async findActiveDoctorPatientAssignment(doctorId: string, patientId: string) {
    return this.prisma.doctorPatient.findFirst({
      where: {
        doctorId,
        patientId,
        unassignedAt: null,
      },
      select: {
        id: true,
      },
    });
  }

  async findPrescriptionDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.prescription, {
      where: {
        id,
      },
      include: PRESCRIPTION_DETAIL_INCLUDE,
    });
  }

  async createPrescription(payload: CreatePrescriptionRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      return tx.prescription.create({
        data: {
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          status: 'ISSUED',
          issuedAt: new Date(),
          notes: payload.notes,
          items: {
            create: payload.items.map((item) => ({
              medicationId: item.medicationId,
              dosage: item.dosage,
              frequency: item.frequency,
              durationDays: item.durationDays,
              quantity: item.quantity,
              instructions: item.instructions,
            })),
          },
        },
        include: PRESCRIPTION_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Creates a dispense record atomically: decrements medication stock with a
   * non-negative guard, re-verifies remaining prescribed quantities inside the
   * transaction, updates the prescription status, and persists the record.
   */
  async createDispense(payload: CreateDispenseRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      await this.lockPrescriptionRow(tx, payload.prescriptionId);
      const hasRemainingQuantity = await this.assertRemainingQuantitiesCoverDispense(tx, payload);
      await this.decrementMedicationStock(tx, payload);
      await tx.prescription.update({
        where: {
          id: payload.prescriptionId,
        },
        data: {
          status: resolvePrescriptionStatusAfterDispense(hasRemainingQuantity),
        },
      });
      return tx.dispenseRecord.create({
        data: {
          prescriptionId: payload.prescriptionId,
          pharmacistId: payload.pharmacistId,
          notes: payload.notes,
          items: {
            create: payload.items.map((item) => ({
              medicationId: item.medicationId,
              quantity: item.quantity,
            })),
          },
        },
        include: DISPENSE_DETAIL_INCLUDE,
      });
    });
  }

  private async lockPrescriptionRow(
    tx: PrismaTransactionClient,
    prescriptionId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "prescriptions" WHERE id = ${prescriptionId}::uuid FOR UPDATE`;
  }

  private async assertRemainingQuantitiesCoverDispense(
    tx: PrismaTransactionClient,
    payload: CreateDispenseRecordPayload,
  ): Promise<boolean> {
    const prescription = await tx.prescription.findFirst({
      where: {
        id: payload.prescriptionId,
        deletedAt: null,
      },
      select: {
        status: true,
        items: {
          select: {
            medicationId: true,
            quantity: true,
          },
        },
        dispenseRecords: {
          where: {
            status: 'DISPENSED',
          },
          select: {
            items: {
              select: {
                medicationId: true,
                quantity: true,
              },
            },
          },
        },
      },
    });

    if (!prescription || (prescription.status !== 'ISSUED' && prescription.status !== 'PARTIALLY_DISPENSED')) {
      throw new ConflictException('Prescription is not in a dispensable state');
    }

    const dispensedByMedication = new Map<string, number>();
    for (const record of prescription.dispenseRecords) {
      for (const item of record.items) {
        const dispensedQty = dispensedByMedication.get(item.medicationId) ?? 0;
        dispensedByMedication.set(item.medicationId, dispensedQty + item.quantity);
      }
    }

    const prescribedByMedication = new Map<string, number>(
      prescription.items.map((item) => [item.medicationId, item.quantity]),
    );

    const dispensingByMedication = new Map<string, number>(
      payload.items.map((item) => [item.medicationId, item.quantity]),
    );

    for (const item of payload.items) {
      const prescribedQty = prescribedByMedication.get(item.medicationId);
      if (prescribedQty === undefined) {
        throw new ConflictException('Dispense item is not part of the prescription');
      }
      const remainingQty = prescribedQty - (dispensedByMedication.get(item.medicationId) ?? 0);
      if (item.quantity > remainingQty) {
        throw new ConflictException('Dispense quantity exceeds remaining prescribed quantity');
      }
    }

    return [...prescribedByMedication.entries()].some(([medicationId, prescribedQty]) => {
      const alreadyDispensedQty = dispensedByMedication.get(medicationId) ?? 0;
      const dispensingQty = dispensingByMedication.get(medicationId) ?? 0;
      return prescribedQty - alreadyDispensedQty - dispensingQty > 0;
    });
  }

  private async decrementMedicationStock(
    tx: PrismaTransactionClient,
    payload: CreateDispenseRecordPayload,
  ): Promise<void> {
    for (const item of payload.items) {
      const updateResult = await tx.medication.updateMany({
        where: {
          id: item.medicationId,
          deletedAt: null,
          stockQty: {
            gte: item.quantity,
          },
        },
        data: {
          stockQty: {
            decrement: item.quantity,
          },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('Insufficient medication stock');
      }
    }
  }
}
