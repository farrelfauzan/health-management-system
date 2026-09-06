import {
  ConvertsProspectivePatient,
  CreatePatientFromProspectiveResult,
  CreatePatientRecordPayload,
  ListPatientsParams,
  PatientAllergyInput,
  PatientDemographicFields,
  PatientIdentifierPlaintext,
  PatientPhoneMatch,
  PatientRecord,
  PatientScopeActor,
  UpdatePatientRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { MrnAllocatorRepository } from '../../../common/mrn/mrn-allocator.repository';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { buildPatientScopeWhere } from './build-patient-scope-where';
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
  source: true,
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
  satusehatPatientIdLast4: true,
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
  lastVisitAt: true,
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
    private readonly privacyNoticeRepository: PrivacyNoticeRepository,
  ) {}

  async listPatients(params: ListPatientsParams, actor: PatientScopeActor) {
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
        buildPatientScopeWhere({ actor, ownership: 'CARE' }),
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

  /**
   * Scoped by-ID fetch. `SELF` ownership on purpose: every caller of this
   * method (identifier unmasking, updates, privacy-notice history) is an
   * action where a treating doctor has no standing — the clinical read path
   * goes through {@link findPatientDetailById} instead. A row outside the
   * actor's scope is `null`, indistinguishable from a missing record.
   */
  async findPatientById(id: string, actor: PatientScopeActor): Promise<PatientRecord | null> {
    const patient = await this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        id,
        AND: [buildPatientScopeWhere({ actor, ownership: 'SELF' })],
      },
      select: PATIENT_RECORD_SELECT,
    });

    return patient ? toPatientRecord(patient) : null;
  }

  /**
   * Scoped clinical detail fetch — `CARE` ownership, so an actively assigned
   * doctor reads their patient through the same SQL boundary the owner does.
   */
  async findPatientDetailById(id: string, actor: PatientScopeActor) {
    const scopedWhere: Prisma.PatientProfileWhereInput = {
      id,
      AND: [buildPatientScopeWhere({ actor, ownership: 'CARE' })],
    };
    const patient = await this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: scopedWhere,
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
   * Resolves active patients whose registered phone number is the one given,
   * compared as normalised digits (`PCS-T07`, strategy §5.1).
   *
   * Raw SQL because the comparison is on a *derived* value: the registry holds
   * whatever the front desk typed — `+62-812-1000-0001`, `0812 1000 0001`,
   * `62812…` — and all three are the same number. Prisma's query builder has
   * no way to express "strip the punctuation, then canonicalise the leading
   * zero", so a generated equality on the stored text would silently miss most
   * real matches, which on this path means a returning patient quietly getting
   * a second, duplicate record.
   *
   * The scan is deliberate and sized: a single clinic's patient table is tens
   * of thousands of rows, and this runs once per chat booking. A functional
   * index is the answer if that ever stops being true.
   *
   * The class is written `[^0-9]` rather than `\D` on purpose. This SQL lives
   * in a template literal, where `\D` is not a recognised escape and collapses
   * to a bare `D` — which would strip the letter D from phone numbers and
   * match nothing, silently, on a path whose failure mode is a duplicate
   * patient record rather than an error anyone would see.
   *
   * Returns **every** match rather than the first, and carries each record's
   * `source`. Two active records sharing one phone number is a real situation
   * — a family sharing a handset — and it is the caller's business to refuse
   * to guess between them. `source` is what lets it tell the two kinds apart:
   * a `FRONT_DESK` record is somebody the clinic knows and whose booking must
   * be earned, a `CHANNEL_BOOKING` record is a draft this chat itself created
   * and can simply reuse.
   */
  async findActivePatientsByNormalisedPhoneNumber(
    normalisedPhoneNumber: string,
  ): Promise<PatientPhoneMatch[]> {
    return this.prisma.$queryRaw<PatientPhoneMatch[]>`
      SELECT "id", "full_name" AS "fullName", "source"
      FROM "patient_profiles"
      WHERE "deleted_at" IS NULL
        AND "is_active" = true
        AND regexp_replace(regexp_replace("phone_number", '[^0-9]', '', 'g'), '^0', '62')
            = ${normalisedPhoneNumber}
      ORDER BY "created_at" ASC
    `;
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
  async findPatientIdentifiers(
    id: string,
    actor: PatientScopeActor,
  ): Promise<PatientIdentifierPlaintext | null> {
    const patient = await this.prisma.findFirstActive(this.prisma.patientProfile, {
      where: {
        id,
        // SELF, never CARE: identifier plaintext is the patient's own
        // business — a treating doctor works on the MRN.
        AND: [buildPatientScopeWhere({ actor, ownership: 'SELF' })],
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

  async createPatient(payload: CreatePatientRecordPayload): Promise<PatientRecord> {
    const patient = await this.prisma
      .executeTransaction((tx) => this.insertPatient(tx, payload))
      .catch(rethrowIdentifierConflict);

    return toPatientRecord(patient);
  }

  /**
   * Registers the person standing at the counter and resolves the prospective
   * record they arrived on, in one transaction (`P17-T04`).
   *
   * It reuses {@link insertPatient} rather than assembling its own insert, and
   * that reuse is the point: the encrypted identifier columns have exactly one
   * write path, so the conversion cannot drift from the ordinary create in how
   * a NIK is encrypted, indexed, or validated. What this method adds is the
   * two writes that must not be able to happen separately — the appointments
   * move onto the new record, and the prospective row is marked `CONVERTED`.
   *
   * The MRN is allocated inside this same transaction by the same allocator,
   * so a conversion that fails anywhere rolls the number back rather than
   * burning it on a record that never existed.
   */
  async createPatientFromProspective(
    payload: CreatePatientRecordPayload & { convertsProspectivePatient: ConvertsProspectivePatient },
  ): Promise<CreatePatientFromProspectiveResult> {
    const result = await this.prisma
      .executeTransaction(async (tx) => {
        const created = await this.insertPatient(tx, payload);
        const conversion = payload.convertsProspectivePatient;
        const moved = await tx.appointment.updateMany({
          where: {
            prospectivePatientId: conversion.prospectivePatientId,
            deletedAt: null,
          },
          // Both columns, because the appointment's CHECK allows exactly one of
          // them to be set (`P17-T02`). Repointing without clearing the old
          // side would violate it and abort the transaction.
          data: { patientId: created.id, prospectivePatientId: null },
        });
        await tx.prospectivePatient.update({
          where: { id: conversion.prospectivePatientId },
          data: {
            status: 'CONVERTED',
            patientId: created.id,
            convertedById: payload.actorUserId,
            convertedAt: conversion.convertedAt,
          },
        });
        return { created, movedAppointments: moved.count };
      })
      .catch(rethrowIdentifierConflict);

    return {
      patient: toPatientRecord(result.created),
      movedAppointments: result.movedAppointments,
    };
  }

  /**
   * The insert itself, without a transaction of its own.
   *
   * Split out so the conversion path can extend the transaction rather than
   * copy the body. Every caller must already be inside one: the MRN allocation
   * below takes a row lock that is only meaningful for as long as the insert
   * it serialises.
   */
  private async insertPatient(
    tx: PrismaTransactionClient,
    payload: CreatePatientRecordPayload,
  ): Promise<PatientProfileRow> {
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
        ...(payload.source === undefined ? {} : { source: payload.source }),
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

    await this.privacyNoticeRepository.captureCurrent(
      tx,
      created.id,
      payload.actorUserId,
      payload.privacyNotice,
    );

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
