import {
  CancelLabOrderPayload,
  CreateLabOrderPayload,
  ExistingEncounterLabItemRecord,
  LabOrderEncounterRecord,
  LabOrderListRecord,
  LabOrderRecord,
  LabOrderStatusValue,
  ListLabOrdersParams,
  ListLabWorklistParams,
  LabWorklistOrderRecord,
  UpdateLabOrderDispositionPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabDailyNumberAllocatorRepository } from './lab-daily-number-allocator.repository';
import { LabOrderListRow, LabOrderRow, LabWorklistRow } from './lab-order-row.types';
import { toLabOrderItemRecord } from './to-lab-order-item-record';
import { toLabSpecimenRecord } from './to-lab-specimen-record';

const LAB_ORDER_ITEM_INCLUDE = {
  orderBy: [{ panelId: 'asc' as const }, { createdAt: 'asc' as const }],
  include: {
    labTest: { select: { code: true, name: true, specimenType: true, resultType: true } },
    panel: { select: { name: true } },
  },
};

const LAB_ORDER_INCLUDE = {
  orderedBy: { select: { fullName: true } },
  items: LAB_ORDER_ITEM_INCLUDE,
  specimens: { orderBy: { collectedAt: 'asc' as const } },
};

/**
 * The bench's projection: the patient identity an analis needs to match a tube
 * to a person, and nothing else from the record. No SOAP, no diagnoses — a
 * worklist is not a route into the medical record (P18-T03).
 */
const LAB_WORKLIST_INCLUDE = {
  orderedBy: { select: { fullName: true, licenseNumber: true } },
  specimens: { orderBy: { collectedAt: 'asc' as const } },
  patient: {
    select: {
      id: true,
      fullName: true,
      mrn: true,
      dateOfBirth: true,
      sex: true,
      // Read as a presence flag only, for the pay-before-collect badge
      // (P18-T06). The number itself never leaves the patient module.
      bpjsNumberIndex: true,
    },
  },
  _count: { select: { items: true } },
};

/**
 * Persistence for lab orders. The only layer that touches Prisma for ordering,
 * and — like `BillingRepository` reading encounters and dispensed items — it
 * reads the encounter row the ordering rules turn on rather than routing a
 * three-field lookup through another module's service.
 */
@Injectable()
export class LabOrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labDailyNumberAllocator: LabDailyNumberAllocatorRepository,
  ) {}

  async findEncounterForOrdering(encounterId: string): Promise<LabOrderEncounterRecord | null> {
    const encounter = await this.prisma.findFirstActive(this.prisma.encounter, {
      where: { id: encounterId },
      select: {
        id: true,
        status: true,
        patientId: true,
        doctorId: true,
        registrationId: true,
        doctor: { select: { ownerUserId: true } },
        patient: { select: { ownerUserId: true } },
      },
    });
    if (!encounter) {
      return null;
    }
    return {
      id: encounter.id,
      status: encounter.status,
      patientId: encounter.patientId,
      doctorId: encounter.doctorId,
      registrationId: encounter.registrationId,
      doctorOwnerUserId: encounter.doctor.ownerUserId,
      patientOwnerUserId: encounter.patient.ownerUserId,
    };
  }

  /**
   * Every test already live on this encounter, with the order that carries it.
   * The duplicate rule is per encounter and not per order: a test ordered on
   * one request and again on a second is a double draw and a double charge,
   * and the 409 has to name the order the patient is already waiting on.
   */
  async findLiveItemsByEncounterId(
    encounterId: string,
  ): Promise<ExistingEncounterLabItemRecord[]> {
    const rows = await this.prisma.labOrderItem.findMany({
      where: {
        status: { not: 'CANCELLED' },
        labOrder: { encounterId, status: { not: 'CANCELLED' } },
      },
      select: { labTestId: true, labOrder: { select: { orderNumber: true } } },
    });
    return rows.map((row) => ({
      labTestId: row.labTestId,
      orderNumber: row.labOrder.orderNumber,
    }));
  }

  /**
   * Writes the order and its expanded items under one transaction, with the
   * number allocated inside it: a rolled-back create returns its number to the
   * pool rather than leaving a permanent gap.
   */
  async createLabOrder(payload: CreateLabOrderPayload): Promise<LabOrderRecord> {
    const row = await this.prisma.executeTransaction(async (tx) => {
      const orderNumber = await this.labDailyNumberAllocator.allocateOrderNumber(
        tx,
        payload.orderedAt,
      );
      return tx.labOrder.create({
        data: {
          encounterId: payload.encounterId,
          registrationId: payload.registrationId,
          source: payload.source,
          patientId: payload.patientId,
          orderedById: payload.orderedById,
          externalRequesterName: payload.externalRequesterName,
          externalRequesterFacility: payload.externalRequesterFacility,
          orderNumber,
          priority: payload.priority,
          clinicalNotes: payload.clinicalNotes,
          isFasting: payload.isFasting,
          fulfilmentSite: payload.fulfilmentSite,
          chargeMode: payload.chargeMode,
          externalFacilityName: payload.externalFacilityName,
          requestLetterDocumentId: payload.requestLetterDocumentId ?? null,
          orderedAt: payload.orderedAt,
          items: {
            create: payload.items.map((item) => ({
              labTestId: item.labTestId,
              panelId: item.panelId,
            })),
          },
        },
        include: LAB_ORDER_INCLUDE,
      }) as unknown as Promise<LabOrderRow>;
    });
    return this.toLabOrderRecord(row);
  }

  async findLabOrderById(id: string): Promise<LabOrderRecord | null> {
    const row = await this.prisma.labOrder.findUnique({
      where: { id },
      include: LAB_ORDER_INCLUDE,
    });
    return row ? this.toLabOrderRecord(row as unknown as LabOrderRow) : null;
  }

  async findLabOrdersByEncounterId(encounterId: string): Promise<LabOrderRecord[]> {
    const rows = await this.prisma.labOrder.findMany({
      where: { encounterId },
      orderBy: { orderedAt: 'asc' },
      include: LAB_ORDER_INCLUDE,
    });
    return rows.map((row) => this.toLabOrderRecord(row as unknown as LabOrderRow));
  }

  async listLabOrders(params: ListLabOrdersParams): Promise<{
    items: LabOrderListRecord[];
    page: number;
    limit: number;
    total: number;
  }> {
    const where = {
      // P18-T13. Exact and case-insensitive: the number is scanned or typed
      // off paper, and `LAB/20260728/0001` is not something anyone browses for.
      ...(params.orderNumber
        ? { orderNumber: { equals: params.orderNumber, mode: 'insensitive' as const } }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.patientId ? { patientId: params.patientId } : {}),
      ...(params.orderedFrom || params.orderedTo
        ? {
            orderedAt: {
              ...(params.orderedFrom ? { gte: params.orderedFrom } : {}),
              ...(params.orderedTo ? { lt: params.orderedTo } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        orderBy: { orderedAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          orderedBy: { select: { fullName: true } },
          patient: { select: { fullName: true, mrn: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.labOrder.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toLabOrderListRecord(row as unknown as LabOrderListRow)),
      page: params.page,
      limit: params.limit,
      total,
    };
  }

  /**
   * The bench's list. Selects the patient identity the analis needs to match a
   * tube to a person and the order's own `clinicalNotes` — and nothing else
   * from the record. `bpjsNumberIndex` is read as a presence flag only, for the
   * pay-before-collect badge (P18-T06); the number itself never leaves the
   * patient module.
   */
  async listWorklist(params: ListLabWorklistParams): Promise<LabWorklistOrderRecord[]> {
    const rows = await this.prisma.labOrder.findMany({
      where: {
        status: { in: [...params.statuses] },
        // P18-T11. Work another lab is running is not this bench's queue. It
        // stays on the order and on the invoice's request list; it just never
        // appears as something to do here.
        fulfilmentSite: 'INTERNAL',
        ...(params.orderedFrom || params.orderedTo
          ? {
              orderedAt: {
                ...(params.orderedFrom ? { gte: params.orderedFrom } : {}),
                ...(params.orderedTo ? { lt: params.orderedTo } : {}),
              },
            }
          : {}),
      },
      // Cito first, then oldest first: the bench works a queue, and an urgent
      // request that sorts by arrival time is an urgent request nobody sees.
      orderBy: [{ priority: 'desc' }, { orderedAt: 'asc' }],
      include: LAB_WORKLIST_INCLUDE,
    });
    return rows.map((row) => this.toWorklistRecord(row as unknown as LabWorklistRow));
  }

  /** One worklist row by order id — what the specimen label reads its patient from. */
  async findWorklistOrderById(id: string): Promise<LabWorklistOrderRecord | null> {
    const row = await this.prisma.labOrder.findUnique({
      where: { id },
      include: LAB_WORKLIST_INCLUDE,
    });
    return row ? this.toWorklistRecord(row as unknown as LabWorklistRow) : null;
  }

  async updateLabOrderDisposition(
    payload: UpdateLabOrderDispositionPayload,
  ): Promise<LabOrderRecord> {
    const row = await this.prisma.labOrder.update({
      where: { id: payload.id },
      data: {
        fulfilmentSite: payload.fulfilmentSite,
        chargeMode: payload.chargeMode,
        externalFacilityName: payload.externalFacilityName,
      },
      include: LAB_ORDER_INCLUDE,
    });
    return this.toLabOrderRecord(row as unknown as LabOrderRow);
  }

  async cancelLabOrder(payload: CancelLabOrderPayload): Promise<LabOrderRecord> {
    const row = await this.prisma.executeTransaction(async (tx) => {
      await tx.labOrderItem.updateMany({
        where: { labOrderId: payload.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      return tx.labOrder.update({
        where: { id: payload.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: payload.cancelledAt,
          cancelReason: payload.cancelReason,
        },
        include: LAB_ORDER_INCLUDE,
      }) as unknown as Promise<LabOrderRow>;
    });
    return this.toLabOrderRecord(row);
  }

  toLabOrderRecord(row: LabOrderRow): LabOrderRecord {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      encounterId: row.encounterId,
      registrationId: row.registrationId,
      source: row.source,
      patientId: row.patientId,
      orderedById: row.orderedById,
      orderedByName: row.orderedBy?.fullName ?? null,
      externalRequesterName: row.externalRequesterName,
      externalRequesterFacility: row.externalRequesterFacility,
      status: row.status,
      priority: row.priority,
      clinicalNotes: row.clinicalNotes,
      isFasting: row.isFasting,
      fulfilmentSite: row.fulfilmentSite,
      chargeMode: row.chargeMode,
      externalFacilityName: row.externalFacilityName,
      recollectCount: row.recollectCount,
      orderedAt: row.orderedAt,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      releasedAt: row.releasedAt,
      items: row.items.map((item) => toLabOrderItemRecord(item)),
      specimens: row.specimens.map((specimen) => toLabSpecimenRecord(specimen)),
    };
  }

  private toLabOrderListRecord(row: LabOrderListRow): LabOrderListRecord {
    return {
      ...this.toOrderHeader(row),
      itemCount: row._count.items,
      patientName: row.patient.fullName,
      patientMrn: row.patient.mrn,
    };
  }

  private toWorklistRecord(row: LabWorklistRow): LabWorklistOrderRecord {
    return {
      ...this.toOrderHeader(row),
      itemCount: row._count.items,
      orderedByLicenseNumber: row.orderedBy?.licenseNumber ?? null,
      specimens: row.specimens.map((specimen) => toLabSpecimenRecord(specimen)),
      patient: {
        id: row.patient.id,
        fullName: row.patient.fullName,
        mrn: row.patient.mrn,
        dateOfBirth: row.patient.dateOfBirth,
        sex: row.patient.sex,
        bpjsNumberIndex: row.patient.bpjsNumberIndex,
      },
    };
  }

  private toOrderHeader(row: Omit<LabOrderRow, 'items' | 'specimens'>) {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      encounterId: row.encounterId,
      registrationId: row.registrationId,
      source: row.source,
      patientId: row.patientId,
      orderedById: row.orderedById,
      orderedByName: row.orderedBy?.fullName ?? null,
      externalRequesterName: row.externalRequesterName,
      externalRequesterFacility: row.externalRequesterFacility,
      status: row.status as LabOrderStatusValue,
      priority: row.priority,
      clinicalNotes: row.clinicalNotes,
      isFasting: row.isFasting,
      fulfilmentSite: row.fulfilmentSite,
      chargeMode: row.chargeMode,
      externalFacilityName: row.externalFacilityName,
      recollectCount: row.recollectCount,
      orderedAt: row.orderedAt,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      releasedAt: row.releasedAt,
    };
  }
}
