import {
  CreatePatientRecordPayload,
  ListPatientsParams,
  PatientAllergyInput,
  PatientDemographicFields,
  PatientIdentifierPlaintext,
  PatientRecord,
  UpdatePatientRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { MrnAllocatorRepository } from '../../../common/mrn/mrn-allocator.repository';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PatientIdentifierConflictError } from './patient-identifier-conflict.error';

const RELATED_DOCTORS_DETAIL_LIMIT = 20;
const RELATED_DOCTORS_LIST_LIMIT = 3;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;
const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * The only projection of `patient_profiles` any query is allowed to request.
 * Listing the columns explicitly keeps `*Ciphertext` and `*Index` out of every
 * result by default, so a future column cannot leak through a `select`-less
 * query.
 */
const PATIENT_RECORD_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  dateOfBirth: true,
  placeOfBirth: true,
  sex: true,
  status: true,
  phoneNumber: true,
  address: true,
  nikLast4: true,
  bpjsNumberLast4: true,
  satusehatPatientIdCiphertext: true,
  email: true,
  bloodType: true,
  rhesusFactor: true,
  maritalStatus: true,
  occupation: true,
  religion: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  guardianName: true,
  guardianRelation: true,
  ownerUserId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PATIENT_ALLERGY_SELECT = {
  id: true,
  substance: true,
  reaction: true,
  severity: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Demographic columns are optional on every write. `undefined` leaves a column
 * untouched, `null` clears it — the same convention the identifier columns use.
 */
const PATIENT_DEMOGRAPHIC_FIELDS = [
  'email',
  'bloodType',
  'rhesusFactor',
  'maritalStatus',
  'occupation',
  'religion',
  'emergencyContactName',
  'emergencyContactPhone',
  'guardianName',
  'guardianRelation',
] as const;

const RELATED_DOCTOR_SELECT = {
  id: true,
  doctor: {
    select: {
      id: true,
      fullName: true,
      specialty: { select: { name: true } },
    },
  },
} as const;

type PatientProfileRow = Omit<PatientRecord, 'hasSatusehatPatientId'> & {
  satusehatPatientIdCiphertext: string | null;
};

function buildInclusiveEndOfDay(date: Date): Date {
  return new Date(date.getTime() + ONE_DAY_IN_MILLISECONDS);
}

/**
 * Collapses a persistence row into the domain record. `satusehatPatientId` is
 * reduced to a boolean: it is never searched and never rendered, so P7-T01 has
 * no reason to decrypt it on a read path.
 */
function toPatientRecord(row: PatientProfileRow): PatientRecord {
  const { satusehatPatientIdCiphertext, ...record } = row;
  return {
    ...record,
    hasSatusehatPatientId: satusehatPatientIdCiphertext !== null,
  };
}

function toAllergyCreateData(allergy: PatientAllergyInput): {
  substance: string;
  reaction: string | null;
  severity: PatientAllergyInput['severity'];
} {
  return {
    substance: allergy.substance,
    reaction: allergy.reaction ?? null,
    severity: allergy.severity,
  };
}

function buildDemographicColumns(
  payload: PatientDemographicFields,
): Record<string, string | null> {
  const columns: Record<string, string | null> = {};
  for (const field of PATIENT_DEMOGRAPHIC_FIELDS) {
    const value = payload[field];
    if (value !== undefined) {
      columns[field] = value;
    }
  }
  return columns;
}

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
 * Translates the database-level uniqueness race — two concurrent creates with
 * the same NIK both passing the service pre-check — into the same conflict the
 * pre-check raises.
 */
function rethrowIdentifierConflict(err: unknown): never {
  if (isUniqueConstraintErrorOn(err, 'nik_index')) {
    throw new PatientIdentifierConflictError('nik');
  }
  if (isUniqueConstraintErrorOn(err, 'bpjs_number_index')) {
    throw new PatientIdentifierConflictError('bpjsNumber');
  }
  if (isUniqueConstraintErrorOn(err, 'mrn')) {
    throw new PatientIdentifierConflictError('mrn');
  }
  throw err;
}

@Injectable()
export class PatientManagementRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
    private readonly mrnAllocator: MrnAllocatorRepository,
  ) {}

  async listPatients(params: ListPatientsParams, currentUser: CurrentUser, hasAnyScope: boolean) {
    const {
      page,
      limit,
      search,
      nik,
      bpjsNumber,
      doctorId,
      status,
      hasAppointment,
      createdFrom,
      createdTo,
    } = params;
    const skip = (page - 1) * limit;
    const activeAppointmentFilter = { deletedAt: null };

    const where = {
      ...(status ? { status } : {}),
      // Exact-match only: the blind index supports equality, never `contains`.
      ...(nik ? { nikIndex: this.identifierCrypto.computeBlindIndex(nik) } : {}),
      ...(bpjsNumber
        ? { bpjsNumberIndex: this.identifierCrypto.computeBlindIndex(bpjsNumber) }
        : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lt: buildInclusiveEndOfDay(createdTo) } : {}),
            },
          }
        : {}),
      ...(doctorId
        ? {
            doctors: {
              some: {
                doctorId,
                unassignedAt: null,
              },
            },
          }
        : {}),
      ...(hasAppointment === true
        ? {
            appointments: {
              some: activeAppointmentFilter,
            },
          }
        : {}),
      ...(hasAppointment === false
        ? {
            appointments: {
              none: activeAppointmentFilter,
            },
          }
        : {}),
      AND: [
        ...(hasAnyScope
          ? []
          : [
              {
                OR: [
                  { ownerUserId: currentUser.sub },
                  {
                    doctors: {
                      some: {
                        unassignedAt: null,
                        doctor: {
                          ownerUserId: currentUser.sub,
                          deletedAt: null,
                          isActive: true,
                        },
                      },
                    },
                  },
                ],
              },
            ]),
        ...(search
          ? [
              {
                // Never matched against encrypted columns — free-text search
                // covers name and MRN only.
                OR: [
                  {
                    fullName: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    mrn: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const patients = await this.prisma.findManyActive(tx.patientProfile, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          ...PATIENT_RECORD_SELECT,
          _count: {
            select: {
              doctors: {
                where: {
                  unassignedAt: null,
                },
              },
              allergies: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
          doctors: {
            where: {
              unassignedAt: null,
              doctor: {
                deletedAt: null,
                isActive: true,
              },
            },
            orderBy: {
              assignedAt: 'desc' as const,
            },
            take: RELATED_DOCTORS_LIST_LIMIT,
            select: RELATED_DOCTOR_SELECT,
          },
        },
      });

      const count = await this.prisma.countActive(tx.patientProfile, { where });

      return [patients, count] as const;
    });

    return {
      items: items.map((patient) => ({
        ...toPatientRecord(patient),
        _count: patient._count,
        doctors: patient.doctors,
      })),
      total,
      page,
      limit,
    };
  }

  async findPatientById(id: string): Promise<PatientRecord | null> {
    const patient = await this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        id,
      },
      select: PATIENT_RECORD_SELECT,
    });

    return patient ? toPatientRecord(patient) : null;
  }

  async findPatientDetailById(id: string) {
    const patient = await this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        id,
      },
      select: {
        ...PATIENT_RECORD_SELECT,
        doctors: {
          where: {
            unassignedAt: null,
            doctor: {
              deletedAt: null,
            },
          },
          orderBy: {
            assignedAt: 'desc' as const,
          },
          take: RELATED_DOCTORS_DETAIL_LIMIT,
          select: RELATED_DOCTOR_SELECT,
        },
        allergies: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'asc' as const,
          },
          select: PATIENT_ALLERGY_SELECT,
        },
      },
    });

    if (!patient) {
      return null;
    }

    return {
      ...toPatientRecord(patient),
      doctors: patient.doctors,
      allergies: patient.allergies,
    };
  }

  async findPatientByMrn(mrn: string) {
    return this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        mrn,
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * Resolves a patient by exact NIK. Normalisation happens in the schema layer;
   * this hashes with the secret pepper and queries the blind index.
   */
  async findPatientIdByNik(normalisedNik: string): Promise<{ id: string } | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        nikIndex: this.identifierCrypto.computeBlindIndex(normalisedNik),
      },
      select: {
        id: true,
      },
    });
  }

  async findPatientIdByBpjsNumber(normalisedBpjsNumber: string): Promise<{ id: string } | null> {
    return this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        bpjsNumberIndex: this.identifierCrypto.computeBlindIndex(normalisedBpjsNumber),
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * The one query allowed to decrypt. Kept separate from every read path so
   * plaintext is produced only when a caller has explicitly asked for it and
   * the service has already checked `patient.read-identifier` and written the
   * audit event. The decrypted values live in memory for the duration of the
   * response and are never logged.
   */
  async findPatientIdentifiers(id: string): Promise<PatientIdentifierPlaintext | null> {
    const patient = await this.prisma.findUniqueActive(this.prisma.patientProfile, {
      where: {
        id,
      },
      select: {
        nikCiphertext: true,
        bpjsNumberCiphertext: true,
        satusehatPatientIdCiphertext: true,
      },
    });

    if (!patient) {
      return null;
    }

    return {
      nik: this.decryptOptional(patient.nikCiphertext),
      bpjsNumber: this.decryptOptional(patient.bpjsNumberCiphertext),
      satusehatPatientId: this.decryptOptional(patient.satusehatPatientIdCiphertext),
    };
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

  async findActiveDoctorsByIds(ids: string[]) {
    return this.prisma.findManyActive(this.prisma.doctorProfile, {
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

  async hasActiveAssignmentWithDoctorUser(patientId: string, doctorUserId: string) {
    const assignmentCount = await this.prisma.doctorPatient.count({
      where: {
        patientId,
        unassignedAt: null,
        doctor: {
          ownerUserId: doctorUserId,
          deletedAt: null,
          isActive: true,
        },
      },
    });

    return assignmentCount > 0;
  }

  async createPatient(payload: CreatePatientRecordPayload): Promise<PatientRecord> {
    const patient = await this.prisma
      .executeTransaction(async (tx) => {
        // Allocation shares this transaction on purpose: the row lock behind
        // the counter update serialises concurrent registrations, and a
        // rolled-back create rolls the counter back with it rather than leaving
        // a hole in the sequence.
        const mrn = payload.mrn ?? (await this.mrnAllocator.allocateMrn(tx));

        if (payload.mrn) {
          await this.mrnAllocator.raiseCounterAbove(tx, payload.mrn);
        }

        const created = await tx.patientProfile.create({
          data: {
            mrn,
            fullName: payload.fullName,
            dateOfBirth: payload.dateOfBirth,
            placeOfBirth: payload.placeOfBirth ?? null,
            sex: payload.sex,
            status: payload.status,
            phoneNumber: payload.phoneNumber,
            address: payload.address,
            ownerUserId: payload.ownerUserId ?? null,
            isActive: payload.isActive,
            ...this.buildIdentifierColumns({
              nik: payload.nik ?? null,
              bpjsNumber: payload.bpjsNumber ?? null,
            }),
            ...buildDemographicColumns(payload),
            allergies: {
              create: (payload.allergies ?? []).map(toAllergyCreateData),
            },
          },
          select: PATIENT_RECORD_SELECT,
        });

        for (const doctorId of payload.doctorIds ?? []) {
          const assignment = await tx.doctorPatient.create({
            data: {
              doctorId,
              patientId: created.id,
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

        return created;
      })
      .catch(rethrowIdentifierConflict);

    return toPatientRecord(patient);
  }

  async updatePatient(id: string, payload: UpdatePatientRecordPayload): Promise<PatientRecord> {
    const patient = await this.prisma
      .executeTransaction(async (tx) => {
        if (payload.allergies !== undefined) {
          // Soft delete rather than remove: a retracted allergy is still part
          // of the clinical history.
          await tx.patientAllergy.updateMany({
            where: {
              patientId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }

        return tx.patientProfile.update({
          where: {
            id,
          },
          data: {
            ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
            ...(payload.dateOfBirth !== undefined ? { dateOfBirth: payload.dateOfBirth } : {}),
            ...(payload.placeOfBirth !== undefined ? { placeOfBirth: payload.placeOfBirth } : {}),
            ...(payload.sex !== undefined ? { sex: payload.sex } : {}),
            ...(payload.status !== undefined ? { status: payload.status } : {}),
            ...(payload.phoneNumber !== undefined ? { phoneNumber: payload.phoneNumber } : {}),
            ...(payload.address !== undefined ? { address: payload.address } : {}),
            ...(payload.ownerUserId !== undefined ? { ownerUserId: payload.ownerUserId } : {}),
            ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
            ...this.buildIdentifierColumns({
              nik: payload.nik,
              bpjsNumber: payload.bpjsNumber,
            }),
            ...buildDemographicColumns(payload),
            ...(payload.allergies !== undefined
              ? { allergies: { create: payload.allergies.map(toAllergyCreateData) } }
              : {}),
          },
          select: PATIENT_RECORD_SELECT,
        });
      })
      .catch(rethrowIdentifierConflict);

    return toPatientRecord(patient);
  }

  /**
   * Maps plaintext identifiers onto their persistence columns. `undefined`
   * leaves an identifier untouched, `null` clears it, and a value re-encrypts
   * and re-indexes it under the current key version.
   */
  private buildIdentifierColumns(input: {
    nik?: string | null;
    bpjsNumber?: string | null;
  }): Record<string, string | number | null> {
    return {
      ...this.buildSearchableIdentifierColumns('nik', input.nik),
      ...this.buildSearchableIdentifierColumns('bpjsNumber', input.bpjsNumber),
    };
  }

  private decryptOptional(ciphertext: string | null): string | null {
    return ciphertext === null ? null : this.identifierCrypto.decryptIdentifier(ciphertext);
  }

  private buildSearchableIdentifierColumns(
    field: 'nik' | 'bpjsNumber',
    value: string | null | undefined,
  ): Record<string, string | number | null> {
    if (value === undefined) {
      return {};
    }
    const encrypted = value ? this.identifierCrypto.encryptSearchableIdentifier(value) : null;
    return {
      [`${field}Ciphertext`]: encrypted?.ciphertext ?? null,
      [`${field}Index`]: encrypted?.index ?? null,
      [`${field}Last4`]: encrypted?.last4 ?? null,
      [`${field}KeyVersion`]: encrypted?.keyVersion ?? null,
    };
  }
}
