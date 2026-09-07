import {
  CollectLabSpecimensPayload,
  LabSpecimenRecord,
  RejectLabSpecimenPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { LabDailyNumberAllocatorRepository } from './lab-daily-number-allocator.repository';
import { LabSpecimenRow } from './lab-order-row.types';
import { toLabSpecimenRecord } from './to-lab-specimen-record';

/**
 * Persistence for drawn samples. Collection and rejection are both whole-order
 * state changes — a draw moves the order to COLLECTED and links its items, a
 * rejection returns both to where they were — so each is one transaction
 * rather than a service stitching three writes together.
 */
@Injectable()
export class LabSpecimenRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labDailyNumberAllocator: LabDailyNumberAllocatorRepository,
  ) {}

  async findLabSpecimenById(id: string): Promise<LabSpecimenRecord | null> {
    const row = await this.prisma.labSpecimen.findUnique({ where: { id } });
    return row ? toLabSpecimenRecord(row as unknown as LabSpecimenRow) : null;
  }

  /**
   * Writes one specimen per distinct specimen type, links the items each tube
   * serves, and moves the order to COLLECTED. Accession numbers are allocated
   * inside the transaction, so a rolled-back draw prints no barcode that later
   * belongs to somebody else.
   */
  async collectLabSpecimens(payload: CollectLabSpecimensPayload): Promise<LabSpecimenRecord[]> {
    const rows = await this.prisma.executeTransaction(async (tx) => {
      const created: LabSpecimenRow[] = [];
      for (const specimen of payload.specimens) {
        const accessionNumber = await this.labDailyNumberAllocator.allocateAccessionNumber(
          tx,
          payload.collectedAt,
        );
        const row = await tx.labSpecimen.create({
          data: {
            labOrderId: payload.labOrderId,
            specimenType: specimen.specimenType,
            accessionNumber,
            collectedAt: payload.collectedAt,
            collectedById: payload.collectedById,
            notes: payload.notes,
          },
        });
        await tx.labOrderItem.updateMany({
          where: { id: { in: [...specimen.labOrderItemIds] } },
          data: { specimenId: row.id },
        });
        created.push(row as unknown as LabSpecimenRow);
      }
      await tx.labOrder.update({
        where: { id: payload.labOrderId },
        data: { status: 'COLLECTED' },
      });
      return created;
    });
    return rows.map((row) => toLabSpecimenRecord(row));
  }

  async receiveLabSpecimen(id: string, receivedAt: Date): Promise<LabSpecimenRecord> {
    const row = await this.prisma.labSpecimen.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt },
    });
    return toLabSpecimenRecord(row as unknown as LabSpecimenRow);
  }

  /**
   * A rejected tube releases everything it was carrying: its items go back to
   * PENDING with no specimen, and the order reappears in *to-collect* with the
   * recollect counter bumped. The rejected row itself is kept — the discarded
   * draw is a fact, and the patient sat through it.
   */
  async rejectLabSpecimen(payload: RejectLabSpecimenPayload): Promise<LabSpecimenRecord> {
    const row = await this.prisma.executeTransaction(async (tx) => {
      await tx.labOrderItem.updateMany({
        where: { specimenId: payload.id, status: 'PENDING' },
        data: { specimenId: null },
      });
      await tx.labOrder.update({
        where: { id: payload.labOrderId },
        data: { status: 'ORDERED', recollectCount: { increment: 1 } },
      });
      return tx.labSpecimen.update({
        where: { id: payload.id },
        data: {
          status: 'REJECTED',
          rejectedAt: payload.rejectedAt,
          rejectReason: payload.rejectReason,
          rejectNotes: payload.rejectNotes,
        },
      }) as unknown as Promise<LabSpecimenRow>;
    });
    return toLabSpecimenRecord(row);
  }
}
