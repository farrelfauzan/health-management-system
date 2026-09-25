import {
  DeliveryRecordPayload,
  RecordNewbornCareInput,
  UpdateDeliveryInput,
  UpdateNewbornCareInput,
  computeShkSampleWindow,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { enqueueSatusehatEpisodeClose } from './enqueue-satusehat-episode-close';

/** A baby's newest SHK sample, for the chip on her card (P25-T10). */
const LATEST_SHK_SCREENING = {
  orderBy: { sequence: 'desc' },
  take: 1,
} as const;

/** What one baby is read back with. */
const NEWBORN_INCLUDE = {
  newbornPatient: { select: { fullName: true, birthOrder: true } },
  shkScreenings: LATEST_SHK_SCREENING,
} as const;

/** Everything a birth and its babies are read back with, in one shape. */
const DELIVERY_INCLUDE = {
  attendantDoctor: { select: { fullName: true } },
  uterotonic: { select: { name: true } },
  newbornCareRecords: {
    orderBy: { createdAt: 'asc' },
    include: NEWBORN_INCLUDE,
  },
} as const;

@Injectable()
export class DeliveryRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEpisodeId(pregnancyEpisodeId: string) {
    return this.prisma.deliveryRecord.findUnique({
      where: { pregnancyEpisodeId },
      include: DELIVERY_INCLUDE,
    });
  }

  async findById(id: string) {
    return this.prisma.deliveryRecord.findUnique({ where: { id }, include: DELIVERY_INCLUDE });
  }

  async findNewbornById(id: string) {
    return this.prisma.newbornCareRecord.findUnique({
      where: { id },
      include: {
        newbornPatient: { select: { fullName: true, birthOrder: true } },
        shkScreenings: LATEST_SHK_SCREENING,
        deliveryRecord: {
          select: {
            id: true,
            birthAt: true,
            pregnancyEpisodeId: true,
            attendantDoctor: {
              select: {
                fullName: true,
                // The flat profile number is the STR (D-032); a typed STR row
                // below wins when one is on file.
                licenseNumber: true,
                // The STR, not the SIP: the surat keterangan lahir is signed
                // under the registration that says this person may practise at
                // all. Soft-deleted licences are left out; a withdrawn one is
                // not a number to print.
                licenses: {
                  where: { type: 'STR', deletedAt: null },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { licenseNumber: true },
                },
              },
            },
            pregnancyEpisode: { select: { patientId: true } },
          },
        },
      },
    });
  }

  /**
   * Records the birth and ends the pregnancy in one transaction (P25-T09).
   *
   * The two belong together: a birth that saved while the episode stayed ACTIVE
   * would let a second pregnancy be opened for a woman who has just given
   * birth, and the episode is what every antenatal number is counted from. The
   * SATUSEHAT close is enqueued in the same transaction for the same reason it
   * is on the end route — it is an outbox row attached to the event that ends
   * the pregnancy.
   */
  async createDelivery(payload: DeliveryRecordPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      const delivery = await tx.deliveryRecord.create({
        data: payload,
        include: DELIVERY_INCLUDE,
      });
      await tx.pregnancyEpisode.update({
        where: { id: payload.pregnancyEpisodeId },
        data: { status: 'DELIVERED', endReason: 'DELIVERY', endedAt: payload.birthAt },
      });
      await enqueueSatusehatEpisodeClose(tx, payload.pregnancyEpisodeId);

      return delivery;
    });
  }

  /**
   * Corrects a recorded birth, moving the episode's `endedAt` with it when the
   * birth time changed — the episode ended when the last baby was born, and
   * leaving the old instant would make the record disagree with itself.
   *
   * A new birth time also moves every **untaken first** SHK sample's window
   * (P25-T10), which is measured from it. A taken sample keeps the window it
   * was taken against, and a repeat sample's window runs from the result that
   * asked for it, not from the birth.
   */
  async updateDelivery(id: string, payload: UpdateDeliveryInput) {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.deliveryRecord.update({ where: { id }, data: payload });
      if (payload.birthAt !== undefined) {
        const birthAt = new Date(payload.birthAt);
        const moved = await tx.deliveryRecord.findUniqueOrThrow({
          where: { id },
          select: { pregnancyEpisodeId: true },
        });
        await tx.pregnancyEpisode.update({
          where: { id: moved.pregnancyEpisodeId },
          data: { endedAt: birthAt },
        });
        await tx.shkScreening.updateMany({
          where: {
            sequence: 1,
            sampleTakenAt: null,
            newbornCareRecord: { deliveryRecordId: id },
          },
          data: computeShkSampleWindow(birthAt),
        });
      }

      return tx.deliveryRecord.findUniqueOrThrow({ where: { id }, include: DELIVERY_INCLUDE });
    });
  }

  /**
   * Records a baby and, for a live birth, her first SHK sample in the same
   * transaction (P25-T10): a baby saved without it would never reach the
   * worklist, which is the whole point of tracking the sample.
   */
  async createNewborn(deliveryRecordId: string, payload: RecordNewbornCareInput) {
    return this.prisma.executeTransaction(async (tx) => {
      const newborn = await tx.newbornCareRecord.create({
        data: { ...payload, deliveryRecordId },
        select: { id: true },
      });
      if (payload.outcome === 'LIVE_BIRTH') {
        await this.createFirstShkSample(tx, newborn.id, deliveryRecordId);
      }

      return tx.newbornCareRecord.findUniqueOrThrow({
        where: { id: newborn.id },
        include: NEWBORN_INCLUDE,
      });
    });
  }

  /**
   * Corrects a baby's essentials. An outcome corrected to LIVE_BIRTH gains
   * her first SHK sample; one corrected to STILLBIRTH loses the samples
   * nobody has taken yet, which were never going to be taken.
   */
  async updateNewborn(id: string, payload: UpdateNewbornCareInput) {
    return this.prisma.executeTransaction(async (tx) => {
      const newborn = await tx.newbornCareRecord.update({
        where: { id },
        data: payload,
        select: { deliveryRecordId: true, _count: { select: { shkScreenings: true } } },
      });
      if (payload.outcome === 'LIVE_BIRTH' && newborn._count.shkScreenings === 0) {
        await this.createFirstShkSample(tx, id, newborn.deliveryRecordId);
      }
      if (payload.outcome === 'STILLBIRTH') {
        await tx.shkScreening.deleteMany({
          where: { newbornCareRecordId: id, sampleTakenAt: null },
        });
      }

      return tx.newbornCareRecord.findUniqueOrThrow({ where: { id }, include: NEWBORN_INCLUDE });
    });
  }

  /**
   * The birth orders already taken by the live babies of this birth, read from
   * the patient records that hold them (P24-T10) rather than from a second
   * copy here.
   */
  async listTakenBirthOrders(deliveryRecordId: string): Promise<number[]> {
    const babies = await this.prisma.newbornCareRecord.findMany({
      where: { deliveryRecordId },
      select: {
        stillbirthOrder: true,
        newbornPatient: { select: { birthOrder: true } },
      },
    });
    return babies
      .map((baby) => baby.stillbirthOrder ?? baby.newbornPatient?.birthOrder ?? null)
      .filter((order): order is number => order !== null);
  }

  private async createFirstShkSample(
    tx: PrismaTransactionClient,
    newbornCareRecordId: string,
    deliveryRecordId: string,
  ): Promise<void> {
    const delivery = await tx.deliveryRecord.findUniqueOrThrow({
      where: { id: deliveryRecordId },
      select: { birthAt: true },
    });
    await tx.shkScreening.create({
      data: { newbornCareRecordId, sequence: 1, ...computeShkSampleWindow(delivery.birthAt) },
    });
  }

  /** The profession of the clinician being named as the attendant. */
  async findAttendant(doctorId: string) {
    return this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, deletedAt: null },
      select: { id: true, fullName: true, profession: true },
    });
  }
}
