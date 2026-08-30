import {
  CreateDoctorRecordPayload,
  DoctorEducationInput,
  DoctorIdentifierPlaintext,
  DoctorLicenseWritePayload,
  ListDoctorsParams,
  ReplaceDoctorSchedulesPayload,
  UpdateDoctorRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { DoctorIdentifierConflictError } from './doctor-identifier-conflict.error';

const RELATED_PATIENTS_DETAIL_LIMIT = 20;
const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * The only projection of `doctor_profiles` any query is allowed to request.
 * Listing the columns explicitly keeps `nikCiphertext` and `nikIndex` out of
 * every result by default, so a future column cannot leak through a
 * `select`-less query.
 */
const DOCTOR_RECORD_SELECT = {
  id: true,
  licenseNumber: true,
  fullName: true,
  specialtyId: true,
  phoneNumber: true,
  title: true,
  degrees: true,
  nikLast4: true,
  satusehatPractitionerId: true,
  ownerUserId: true,
  // The doctor's email lives on their account; selecting it here keeps the
  // response shape unchanged while there is only one stored copy.
  ownerUser: { select: { email: true } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
const SCHEDULE_ORDER_BY: Prisma.DoctorScheduleOrderByWithRelationInput[] = [
  { dayOfWeek: 'asc' },
  { startTime: 'asc' },
];
const SPECIALTY_SELECT = {
  select: {
    id: true,
    name: true,
  },
} satisfies Prisma.SpecialtyDefaultArgs;
const LICENSES_INCLUDE = {
  where: {
    deletedAt: null,
  },
  orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  select: {
    id: true,
    type: true,
    licenseNumber: true,
    issuedAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.DoctorProfile$licensesArgs;
const EDUCATIONS_INCLUDE = {
  where: {
    deletedAt: null,
  },
  orderBy: [{ graduationYear: 'desc' }, { createdAt: 'asc' }],
  select: {
    id: true,
    institution: true,
    degree: true,
    fieldOfStudy: true,
    graduationYear: true,
    createdAt: true,
    updatedAt: true,
  },
} satisfies Prisma.DoctorProfile$educationsArgs;

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
 * Translates the database-level uniqueness race — two concurrent writes with
 * the same NIK both passing the service pre-check — into the same conflict the
 * pre-check raises.
 */
function rethrowIdentifierConflict(err: unknown): never {
  if (isUniqueConstraintErrorOn(err, 'nik_index')) {
    throw new DoctorIdentifierConflictError('nik');
  }
  throw err;
}

function toLicenseCreateData(license: DoctorLicenseWritePayload): {
  type: DoctorLicenseWritePayload['type'];
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
} {
  return {
    type: license.type,
    licenseNumber: license.licenseNumber,
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
  };
}

function toEducationCreateData(education: DoctorEducationInput): {
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
} {
  return {
    institution: education.institution,
    degree: education.degree,
    fieldOfStudy: education.fieldOfStudy ?? null,
    graduationYear: education.graduationYear ?? null,
  };
}

@Injectable()
export class DoctorManagementRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async listDoctors(params: ListDoctorsParams) {
    const { page, limit, search, specialtyId, patientId, isActive, missingNik } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(isActive === undefined ? {} : { isActive }),
      ...(specialtyId ? { specialtyId } : {}),
      // `nikIndex` rather than `nikCiphertext`: it is the column the lookup
      // actually needs, and the one carrying the uniqueness constraint, so a
      // half-written row reads as missing here instead of as present.
      ...(missingNik === undefined ? {} : { nikIndex: missingNik ? null : { not: null } }),
      ...(patientId
        ? {
            patients: {
              some: {
                patientId,
                unassignedAt: null,
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                licenseNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                specialty: {
                  name: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const doctors = await this.prisma.findManyActive(tx.doctorProfile, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          ...DOCTOR_RECORD_SELECT,
          specialty: SPECIALTY_SELECT,
          _count: {
            select: {
              patients: {
                where: {
                  unassignedAt: null,
                },
              },
            },
          },
          schedules: {
            orderBy: SCHEDULE_ORDER_BY,
          },
        },
      });

      const count = await this.prisma.countActive(tx.doctorProfile, { where });

      return [doctors, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findDoctorById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        id,
      },
      select: DOCTOR_RECORD_SELECT,
    });
  }

  async findDoctorDetailById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        id,
      },
      select: {
        ...DOCTOR_RECORD_SELECT,
        specialty: SPECIALTY_SELECT,
        _count: {
          select: {
            patients: {
              where: {
                unassignedAt: null,
              },
            },
          },
        },
        patients: {
          where: {
            unassignedAt: null,
            patient: {
              deletedAt: null,
            },
          },
          orderBy: {
            assignedAt: 'desc',
          },
          take: RELATED_PATIENTS_DETAIL_LIMIT,
          select: {
            id: true,
            patient: {
              select: {
                id: true,
                mrn: true,
                fullName: true,
              },
            },
          },
        },
        schedules: {
          orderBy: SCHEDULE_ORDER_BY,
        },
        licenses: LICENSES_INCLUDE,
        educations: EDUCATIONS_INCLUDE,
      },
    });
  }

  /**
   * The one query allowed to decrypt a practitioner NIK. Kept apart from every
   * read path so plaintext is produced only after the service has checked
   * `doctor.read-identifier` and written the audit event.
   */
  async findDoctorIdentifiers(id: string): Promise<DoctorIdentifierPlaintext | null> {
    const doctor = await this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        id,
      },
      select: {
        nikCiphertext: true,
      },
    });

    if (!doctor) {
      return null;
    }

    return {
      nik:
        doctor.nikCiphertext === null
          ? null
          : this.identifierCrypto.decryptIdentifier(doctor.nikCiphertext),
    };
  }

  /**
   * Resolves a doctor by exact NIK. Normalisation happens in the schema layer;
   * this hashes with the secret pepper and queries the blind index. Exact match
   * only — the blind index supports equality, never `contains`.
   */
  async findDoctorByNik(normalisedNik: string) {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: {
        nikIndex: this.identifierCrypto.computeBlindIndex(normalisedNik),
      },
      select: {
        id: true,
      },
    });
  }

  async findDoctorByLicenseNumber(licenseNumber: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        licenseNumber,
      },
      select: {
        id: true,
      },
    });
  }

  async findDoctorByOwnerUserId(ownerUserId: string) {
    return this.prisma.findUniqueActive(this.prisma.doctorProfile, {
      where: {
        ownerUserId,
      },
      select: {
        id: true,
      },
    });
  }

  async findActiveUserById(id: string) {
    return this.prisma.findFirstActive(this.prisma.user, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async findActiveSpecialtyById(id: string) {
    return this.prisma.findFirstActive(this.prisma.specialty, {
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async findActivePatientsByIds(ids: string[]) {
    return this.prisma.findManyActive(this.prisma.patientProfile, {
      where: {
        id: {
          in: ids,
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  async createDoctor(payload: CreateDoctorRecordPayload) {
    return this.prisma
      .executeTransaction(async (tx) => {
        const doctor = await tx.doctorProfile.create({
          data: {
            licenseNumber: payload.licenseNumber,
            fullName: payload.fullName,
            specialtyId: payload.specialtyId,
            phoneNumber: payload.phoneNumber,
            title: payload.title ?? null,
            degrees: payload.degrees ?? null,
            satusehatPractitionerId: payload.satusehatPractitionerId ?? null,
            ownerUserId: payload.ownerUserId ?? null,
            isActive: payload.isActive,
            ...this.buildNikColumns(payload.nik),
            licenses: {
              create: (payload.licenses ?? []).map(toLicenseCreateData),
            },
            educations: {
              create: (payload.educations ?? []).map(toEducationCreateData),
            },
          },
          select: {
            ...DOCTOR_RECORD_SELECT,
            specialty: SPECIALTY_SELECT,
          },
        });

        for (const patientId of payload.patientIds ?? []) {
          const assignment = await tx.doctorPatient.create({
            data: {
              doctorId: doctor.id,
              patientId,
              assignedById: payload.actorUserId,
            },
          });

          await tx.doctorPatientActivity.create({
            data: {
              assignmentId: assignment.id,
              action: 'ASSIGNED',
              actorUserId: payload.actorUserId,
            },
          });
        }

        return doctor;
      })
      .catch(rethrowIdentifierConflict);
  }

  async updateDoctor(id: string, payload: UpdateDoctorRecordPayload) {
    return this.prisma
      .executeTransaction(async (tx) => {
        if (payload.licenses !== undefined) {
          await tx.doctorLicense.updateMany({
            where: {
              doctorId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }
        if (payload.educations !== undefined) {
          await tx.doctorEducation.updateMany({
            where: {
              doctorId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }
        return tx.doctorProfile.update({
          where: {
            id,
          },
          data: {
            ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
            ...(payload.specialtyId !== undefined ? { specialtyId: payload.specialtyId } : {}),
            ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.degrees !== undefined ? { degrees: payload.degrees } : {}),
            ...(payload.satusehatPractitionerId !== undefined
              ? { satusehatPractitionerId: payload.satusehatPractitionerId }
              : {}),
            ...(payload.ownerUserId !== undefined ? { ownerUserId: payload.ownerUserId } : {}),
            ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
            ...this.buildNikColumns(payload.nik),
            ...(payload.licenses !== undefined
              ? { licenses: { create: payload.licenses.map(toLicenseCreateData) } }
              : {}),
            ...(payload.educations !== undefined
              ? { educations: { create: payload.educations.map(toEducationCreateData) } }
              : {}),
          },
          select: {
            ...DOCTOR_RECORD_SELECT,
            specialty: SPECIALTY_SELECT,
          },
        });
      })
      .catch(rethrowIdentifierConflict);
  }

  /**
   * Maps a plaintext NIK onto its persistence columns. `undefined` leaves the
   * identifier untouched; a value re-encrypts and re-indexes it under the
   * current key version. There is deliberately no clearing branch — a doctor
   * who loses their NIK loses SATUSEHAT reporting permanently (SJ-75), so
   * neither schema accepts `null` any more.
   */
  private buildNikColumns(nik: string | undefined): Record<string, string | number> {
    if (nik === undefined) {
      return {};
    }
    const encrypted = this.identifierCrypto.encryptSearchableIdentifier(nik);
    return {
      nikCiphertext: encrypted.ciphertext,
      nikIndex: encrypted.index,
      nikLast4: encrypted.last4,
      nikKeyVersion: encrypted.keyVersion,
    };
  }

  async replaceDoctorSchedules(payload: ReplaceDoctorSchedulesPayload) {
    return this.prisma.executeTransaction(async (tx) => {
      await tx.doctorSchedule.deleteMany({
        where: {
          doctorId: payload.doctorId,
        },
      });

      for (const entry of payload.entries) {
        await tx.doctorSchedule.create({
          data: {
            doctorId: payload.doctorId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isAvailable: entry.isAvailable,
            maxPatients: entry.maxPatients ?? null,
          },
        });
      }

      return tx.doctorSchedule.findMany({
        where: {
          doctorId: payload.doctorId,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }
}
