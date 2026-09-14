import { SaveSatusehatLocationIdPayload, SatusehatLocationSourceRecords } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

/** Active rows, plus inactive or deleted ones that were registered and may need pushing. */
const REGISTRABLE_OR_REGISTERED = {
  OR: [{ isActive: true, deletedAt: null }, { satusehatLocationId: { not: null } }],
};

/**
 * Reads the rows the SATUSEHAT Location tree is built from and stores the ids
 * SATUSEHAT assigns (P24-T06). It reaches into the clinic profile, specialty
 * and room tables directly, as {@link SatusehatLinkRepository} does for patient
 * and doctor profiles: the Location id columns exist for this integration
 * alone, and no other module reads or writes them.
 */
@Injectable()
export class SatusehatLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLocationSources(): Promise<SatusehatLocationSourceRecords> {
    const [clinic, specialties, wards, rooms, beds] = await Promise.all([
      this.prisma.clinicProfile.findFirst({
        select: { id: true, name: true, latitude: true, longitude: true, satusehatLocationId: true },
      }),
      this.prisma.specialty.findMany({
        where: REGISTRABLE_OR_REGISTERED,
        select: { id: true, name: true, isActive: true, deletedAt: true, satusehatLocationId: true },
      }),
      this.prisma.ward.findMany({
        where: REGISTRABLE_OR_REGISTERED,
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          deletedAt: true,
          satusehatLocationId: true,
        },
      }),
      this.prisma.room.findMany({
        where: REGISTRABLE_OR_REGISTERED,
        select: {
          id: true,
          wardId: true,
          code: true,
          name: true,
          isActive: true,
          deletedAt: true,
          satusehatLocationId: true,
          roomClass: { select: { name: true, satusehatServiceClass: true } },
        },
      }),
      this.prisma.bed.findMany({
        where: { OR: [{ deletedAt: null }, { satusehatLocationId: { not: null } }] },
        select: { id: true, roomId: true, code: true, deletedAt: true, satusehatLocationId: true },
      }),
    ]);
    return {
      clinic:
        clinic === null
          ? null
          : {
              id: clinic.id,
              name: clinic.name,
              latitude: clinic.latitude === null ? null : Number(clinic.latitude),
              longitude: clinic.longitude === null ? null : Number(clinic.longitude),
              satusehatLocationId: clinic.satusehatLocationId,
            },
      specialties: specialties.map(({ deletedAt, ...row }) => ({ ...row, isDeleted: deletedAt !== null })),
      wards: wards.map(({ deletedAt, ...row }) => ({ ...row, isDeleted: deletedAt !== null })),
      rooms: rooms.map(({ deletedAt, ...row }) => ({ ...row, isDeleted: deletedAt !== null })),
      beds: beds.map(({ deletedAt, ...row }) => ({ ...row, isDeleted: deletedAt !== null })),
    };
  }

  async saveLocationId(payload: SaveSatusehatLocationIdPayload): Promise<void> {
    const where = { where: { id: payload.id }, data: { satusehatLocationId: payload.satusehatLocationId } };
    switch (payload.kind) {
      case 'SITE':
        await this.prisma.clinicProfile.update(where);
        return;
      case 'SPECIALTY':
        await this.prisma.specialty.update(where);
        return;
      case 'WARD':
        await this.prisma.ward.update(where);
        return;
      case 'ROOM':
        await this.prisma.room.update(where);
        return;
      case 'BED':
        await this.prisma.bed.update(where);
        return;
    }
  }
}
