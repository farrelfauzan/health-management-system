import {
  CreateDispenseRecordPayload,
  CreateMedicationRecordPayload,
  CreatePrescriptionRecordPayload,
  CreateStockReceiptRecordPayload,
  ListMedicationsParams,
  ListPrescriptionsParams,
  ListStockReceiptsParams,
  PrescriptionScopeActor,
  resolvePrescriptionStatusAfterDispense,
  UpdateMedicationRecordPayload,
} from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { Prisma } from '../../../generated/prisma/client';
import { buildPrescriptionScopeWhere } from './build-prescription-scope-where';
import { MedicationIdentifierConflictError } from './medication-identifier-conflict.error';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const MEDICATION_PROJECTION_SELECT = {
  id: true,
  code: true,
  name: true,
} satisfies Prisma.MedicationSelect;

const STOCK_RELATION_INCLUDE = {
  stockReceipts: {
    where: {
      remainingQuantity: { gt: 0 },
    },
    select: {
      remainingQuantity: true,
      expiryDate: true,
    },
  },
} satisfies Prisma.MedicationInclude;

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
      stockAllocations: {
        include: {
          stockReceipt: {
            select: { id: true, batchNumber: true, expiryDate: true },
          },
        },
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
    const { page, limit, search, category, reorderOnly, inventoryDate } = params;

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

    const medications = await this.prisma.findManyActive(this.prisma.medication, {
      where,
      orderBy: {
        name: 'asc',
      },
      include: this.availableStockInclude(inventoryDate),
    });
    const withStock = medications.map((medication) => this.withComputedStock(medication));
    const filtered = reorderOnly
      ? withStock.filter((medication) => medication.stockQty <= medication.reorderLevel)
      : withStock;
    const skip = (page - 1) * limit;

    return {
      items: filtered.slice(skip, skip + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  async listPrescriptions(params: ListPrescriptionsParams, actor: PrescriptionScopeActor) {
    const { page, limit, status, patientId, doctorId, encounterId } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(encounterId ? { encounterId } : {}),
      AND: [buildPrescriptionScopeWhere(actor)],
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

  async findMedicationById(id: string, inventoryDate: Date) {
    const medication = await this.prisma.findUniqueActive(this.prisma.medication, {
      where: {
        id,
      },
      include: this.availableStockInclude(inventoryDate),
    });
    return medication ? this.withComputedStock(medication) : null;
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
          reorderLevel: payload.reorderLevel,
        },
        include: STOCK_RELATION_INCLUDE,
      })
      .then((medication) => this.withComputedStock(medication))
      .catch(rethrowMedicationIdentifierConflict);
  }

  async updateMedication(id: string, payload: UpdateMedicationRecordPayload, inventoryDate: Date) {
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
          ...(payload.reorderLevel !== undefined ? { reorderLevel: payload.reorderLevel } : {}),
        },
        include: this.availableStockInclude(inventoryDate),
      })
      .then((medication) => this.withComputedStock(medication))
      .catch(rethrowMedicationIdentifierConflict);
  }

  async findActiveMedicationsByIds(medicationIds: string[], inventoryDate: Date) {
    const medications = await this.prisma.findManyActive(this.prisma.medication, {
      where: {
        id: {
          in: medicationIds,
        },
      },
      include: this.availableStockInclude(inventoryDate),
    });
    return medications.map((medication) => this.withComputedStock(medication));
  }

  async createStockReceipt(payload: CreateStockReceiptRecordPayload) {
    return this.prisma.medicationStockReceipt.create({
      data: {
        medicationId: payload.medicationId,
        batchNumber: payload.batchNumber,
        expiryDate: payload.expiryDate,
        quantity: payload.quantity,
        remainingQuantity: payload.quantity,
        receivedAt: payload.receivedAt,
        receivedById: payload.receivedById,
        notes: payload.notes,
      },
      include: this.stockReceiptInclude(),
    });
  }

  async listStockReceipts(params: ListStockReceiptsParams) {
    const where = params.medicationId ? { medicationId: params.medicationId } : {};
    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const rows = await tx.medicationStockReceipt.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        include: this.stockReceiptInclude(),
      });
      return [rows, await tx.medicationStockReceipt.count({ where })] as const;
    });
    return { items, total, page: params.page, limit: params.limit };
  }

  async getInventorySummary(asOfDate: Date) {
    const medications = await this.prisma.findManyActive(this.prisma.medication, {
      orderBy: { name: 'asc' },
      include: {
        stockReceipts: {
          select: {
            expiryDate: true,
            remainingQuantity: true,
          },
        },
      },
    });
    return medications.map((medication) => {
      const availableReceipts = medication.stockReceipts.filter(
        (receipt) =>
          receipt.remainingQuantity > 0 &&
          (receipt.expiryDate === null || receipt.expiryDate >= asOfDate),
      );
      const stockQty = availableReceipts.reduce(
        (sum, receipt) => sum + receipt.remainingQuantity,
        0,
      );
      const knownExpiryDates = availableReceipts
        .filter((receipt) => receipt.expiryDate)
        .map((receipt) => receipt.expiryDate as Date);
      return {
        medicationId: medication.id,
        medicationCode: medication.code,
        medicationName: medication.name,
        stockQty,
        reorderLevel: medication.reorderLevel,
        nearestExpiryDate:
          knownExpiryDates.length > 0
            ? new Date(Math.min(...knownExpiryDates.map((date) => date.getTime())))
            : null,
        unknownExpiryQty: availableReceipts
          .filter((receipt) => receipt.expiryDate === null)
          .reduce((sum, receipt) => sum + receipt.remainingQuantity, 0),
      };
    });
  }

  async getExpiryReport(throughDate: Date) {
    const rows = await this.prisma.medicationStockReceipt.findMany({
      where: {
        remainingQuantity: { gt: 0 },
        OR: [{ expiryDate: null }, { expiryDate: { lte: throughDate } }],
      },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
      include: this.stockReceiptInclude(),
    });
    return rows;
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

  /**
   * The encounter a prescription is being attached to. Only the fields the
   * pharmacy needs to validate the link — the clinical record itself is read
   * through the EMR module.
   */
  async findEncounterForPrescription(encounterId: string) {
    return this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id: encounterId },
      select: {
        id: true,
        patientId: true,
        status: true,
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
          encounterId: payload.encounterId,
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
   *
   * An encounter-linked dispense for a BPJS patient also enqueues the OBAT
   * outbox row (P11-T06) in the same transaction — the same deliberate
   * cross-module write as the pendaftaran/kunjungan enqueues: a dispense and
   * its reporting queue entry commit or roll back together. The upsert is a
   * no-op when the visit's OBAT row already exists, so a follow-up dispense
   * after the medications were reported does not re-open a settled row.
   */
  async createDispense(payload: CreateDispenseRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      await this.lockPrescriptionRow(tx, payload.prescriptionId);
      const hasRemainingQuantity = await this.assertRemainingQuantitiesCoverDispense(tx, payload);
      await tx.prescription.update({
        where: {
          id: payload.prescriptionId,
        },
        data: {
          status: resolvePrescriptionStatusAfterDispense(hasRemainingQuantity),
        },
      });
      const created = await tx.dispenseRecord.create({
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
        include: { items: true },
      });
      await this.allocateStockFefo(tx, created.items, payload.items, payload.inventoryDate);
      await this.enqueueBpjsObat(tx, payload.prescriptionId);
      return tx.dispenseRecord.findUniqueOrThrow({
        where: { id: created.id },
        include: DISPENSE_DETAIL_INCLUDE,
      });
    });
  }

  private async enqueueBpjsObat(
    tx: PrismaTransactionClient,
    prescriptionId: string,
  ): Promise<void> {
    const prescription = await tx.prescription.findUnique({
      where: { id: prescriptionId },
      select: {
        encounter: { select: { registrationId: true } },
        patient: { select: { bpjsNumberCiphertext: true } },
      },
    });
    if (!prescription?.encounter || !prescription.patient.bpjsNumberCiphertext) {
      return;
    }
    const activeConfig = await tx.bpjsPcareConfig.findFirst({
      where: { facilityId: null, isActive: true },
      select: { id: true },
    });
    if (!activeConfig) {
      return;
    }
    await tx.bpjsSubmission.upsert({
      where: {
        registrationId_type: {
          registrationId: prescription.encounter.registrationId,
          type: 'OBAT',
        },
      },
      create: { registrationId: prescription.encounter.registrationId, type: 'OBAT' },
      update: {},
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

  private async allocateStockFefo(
    tx: PrismaTransactionClient,
    dispenseItems: Array<{ id: string; medicationId: string }>,
    requestedItems: CreateDispenseRecordPayload['items'],
    clinicToday: Date,
  ): Promise<void> {
    const sortedItems = [...requestedItems].sort((left, right) =>
      left.medicationId.localeCompare(right.medicationId),
    );
    for (const requestItem of sortedItems) {
      const dispenseItem = dispenseItems.find(
        (candidate) => candidate.medicationId === requestItem.medicationId,
      );
      if (!dispenseItem) throw new ConflictException('Dispense item was not persisted');
      const receipts = await tx.$queryRaw<
        Array<{ id: string; remainingQuantity: number }>
      >`
        SELECT r.id, r."remaining_quantity" AS "remainingQuantity"
        FROM "medication_stock_receipts" r
        WHERE r."medication_id" = ${requestItem.medicationId}::uuid
          AND (r."expiry_date" IS NULL OR r."expiry_date" >= ${clinicToday}::date)
          AND r."remaining_quantity" > 0
        ORDER BY r."expiry_date" ASC NULLS LAST, r."received_at" ASC, r.id ASC
        FOR UPDATE OF r
      `;
      let unallocated = requestItem.quantity;
      const allocations: Array<{ dispenseItemId: string; stockReceiptId: string; quantity: number }> = [];
      for (const receipt of receipts) {
        if (unallocated === 0) break;
        const quantity = Math.min(unallocated, receipt.remainingQuantity);
        const decrement = await tx.medicationStockReceipt.updateMany({
          where: { id: receipt.id, remainingQuantity: { gte: quantity } },
          data: { remainingQuantity: { decrement: quantity } },
        });
        if (decrement.count !== 1) {
          throw new ConflictException('Medication stock changed during dispense');
        }
        allocations.push({ dispenseItemId: dispenseItem.id, stockReceiptId: receipt.id, quantity });
        unallocated -= quantity;
      }
      if (unallocated > 0) {
        throw new ConflictException('Insufficient medication stock');
      }
      await tx.dispenseItemStockAllocation.createMany({ data: allocations });
    }
  }

  private withComputedStock<
    T extends {
      stockReceipts: Array<{ remainingQuantity: number; expiryDate: Date | null }>;
    },
  >(medication: T): Omit<T, 'stockReceipts'> & { stockQty: number } {
    const { stockReceipts, ...record } = medication;
    return {
      ...record,
      stockQty: stockReceipts.reduce((sum, receipt) => sum + receipt.remainingQuantity, 0),
    };
  }

  private stockReceiptInclude() {
    return {
      medication: { select: { id: true, code: true, name: true } },
      allocations: { select: { quantity: true } },
    } as const;
  }

  private availableStockInclude(inventoryDate: Date) {
    const include = {
      stockReceipts: {
        where: {
          remainingQuantity: { gt: 0 },
          OR: [{ expiryDate: null }, { expiryDate: { gte: inventoryDate } }],
        },
        select: { remainingQuantity: true, expiryDate: true },
      },
    } satisfies Prisma.MedicationInclude;
    return include;
  }
}
