import {
  DeliveryRecordPayload,
  RecordNewbornCareInput,
  UpdateDeliveryInput,
  UpdateNewbornCareInput,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { enqueueSatusehatEpisodeClose } from './enqueue-satusehat-episode-close';

/** Everything a birth and its babies are read back with, in one shape. */
const DELIVERY_INCLUDE = {
  attendantDoctor: { select: { fullName: true } },
  uterotonic: { select: { name: true } },
  newbornCareRecords: {
    orderBy: { createdAt: 'asc' },
    include: {
      newbornPatient: { select: { fullName: true, birthOrder: true } },
    },
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
        deliveryRecord: {
          select: {
            id: true,
            birthAt: true,
            pregnancyEpisodeId: true,
            attendantDoctor: {
              select: {
                fullName: true,
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
   */
  async updateDelivery(id: string, payload: UpdateDeliveryInput) {
    return this.prisma.executeTransaction(async (tx) => {
      const delivery = await tx.deliveryRecord.update({
        where: { id },
        data: payload,
        include: DELIVERY_INCLUDE,
      });
      if (payload.birthAt !== undefined) {
        await tx.pregnancyEpisode.update({
          where: { id: delivery.pregnancyEpisodeId },
          data: { endedAt: delivery.birthAt },
        });
      }

      return delivery;
    });
  }

  async createNewborn(deliveryRecordId: string, payload: RecordNewbornCareInput) {
    return this.prisma.newbornCareRecord.create({
      data: { ...payload, deliveryRecordId },
      include: { newbornPatient: { select: { fullName: true, birthOrder: true } } },
    });
  }

  async updateNewborn(id: string, payload: UpdateNewbornCareInput) {
    return this.prisma.newbornCareRecord.update({
      where: { id },
      data: payload,
      include: { newbornPatient: { select: { fullName: true, birthOrder: true } } },
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

  /** The profession of the clinician being named as the attendant. */
  async findAttendant(doctorId: string) {
    return this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, deletedAt: null },
      select: { id: true, fullName: true, profession: true },
    });
  }
}
