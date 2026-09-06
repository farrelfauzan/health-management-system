import {
  AdmissionRecord,
  AdmitPatientRecordPayload,
  CancelAdmissionRecordPayload,
  DischargeAdmissionRecordPayload,
  ListAdmissionsParams,
  TransferAdmissionRecordPayload,
  UpdateAdmissionRecordPayload,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { Prisma } from '../../../generated/prisma/client';
import { AdmissionConflictError } from './admission-conflict.error';

const UNIQUE_VIOLATION_CODE = 'P2002';

const BED_OPEN_ASSIGNMENT_INDEX = 'bed_assignments_bed_id_open_key';

const ADMISSION_BED_INCLUDE = {
  room: {
    select: {
      id: true,
      code: true,
      name: true,
      roomClass: { select: { id: true, code: true, name: true } },
      ward: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.BedInclude;

const ADMISSION_INCLUDE = {
  patient: { select: { id: true, mrn: true, fullName: true, ownerUserId: true } },
  admittingDoctor: { select: { id: true, fullName: true, ownerUserId: true } },
  bedAssignments: {
    orderBy: { startedAt: 'asc' },
    include: { bed: { include: ADMISSION_BED_INCLUDE } },
  },
} satisfies Prisma.AdmissionInclude;

const ADMISSION_LIST_ORDER_BY = [
  { admittedAt: 'desc' },
] satisfies Prisma.AdmissionOrderByWithRelationInput[];

type AdmissionRow = Prisma.AdmissionGetPayload<{ include: typeof ADMISSION_INCLUDE }>;

@Injectable()
export class AdmissionFlowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmissions(params: ListAdmissionsParams): Promise<{
    items: AdmissionRecord[];
    page: number;
    limit: number;
    total: number;
  }> {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where = this.buildListFilter(params);
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const admissions = await this.prisma.findManyActive(tx.admission, {
        where,
        skip,
        take: limit,
        orderBy: ADMISSION_LIST_ORDER_BY,
        include: ADMISSION_INCLUDE,
      });
      const count = await this.prisma.countActive(tx.admission, { where });
      return [admissions, count] as const;
    });

    return { items: rows.map((row) => this.toAdmissionRecord(row)), page, limit, total };
  }

  async findAdmissionById(id: string): Promise<AdmissionRecord | null> {
    const row = await this.prisma.findFirstActive(this.prisma.admission, {
      where: { id },
      include: ADMISSION_INCLUDE,
    });
    return row ? this.toAdmissionRecord(row) : null;
  }

  async findActiveDoctorByOwnerUserId(ownerUserId: string): Promise<{ id: string } | null> {
    return this.prisma.findFirstActive(this.prisma.doctorProfile, {
      where: { ownerUserId, isActive: true },
      select: { id: true },
    });
  }

  async findActiveDoctorPatientAssignment(
    doctorId: string,
    patientId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.doctorPatient.findFirst({
      where: { doctorId, patientId, unassignedAt: null },
      select: { id: true },
    });
  }

  /**
   * Admit, as one transaction: the stay, its first bed assignment, the bed's
   * projected status, and the patient's status all move together or not at all.
   *
   * The double-booking guard is the partial unique index on
   * `bed_assignments (bed_id) WHERE ended_at IS NULL`, not a read of
   * `beds.status` — two concurrent admits would both read AVAILABLE, and only
   * one can insert.
   */
  async admitPatient(payload: AdmitPatientRecordPayload): Promise<AdmissionRecord> {
    try {
      const admission = await this.prisma.executeTransaction(async (tx) => {
        const created = await tx.admission.create({
          data: {
            patientId: payload.patientId,
            admittingDoctorId: payload.admittingDoctorId,
            sourceEncounterId: payload.sourceEncounterId,
            reason: payload.reason,
            admittedAt: payload.admittedAt,
            createdById: payload.createdById,
          },
        });
        await tx.bedAssignment.create({
          data: {
            admissionId: created.id,
            bedId: payload.bedId,
            startedAt: payload.admittedAt,
            createdById: payload.createdById,
          },
        });
        await tx.bed.update({ where: { id: payload.bedId }, data: { status: 'OCCUPIED' } });
        // Finally activating the enum that has existed since the first
        // migration with nothing able to set it.
        await tx.patientProfile.update({
          where: { id: payload.patientId },
          data: { status: 'IN_PATIENT' },
        });
        return tx.admission.findUniqueOrThrow({
          where: { id: created.id },
          include: ADMISSION_INCLUDE,
        });
      });

      return this.toAdmissionRecord(admission);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  /** Close one assignment, open the next, flip both beds — one transaction. */
  async transferAdmission(payload: TransferAdmissionRecordPayload): Promise<AdmissionRecord> {
    try {
      const admission = await this.prisma.executeTransaction(async (tx) => {
        await tx.bedAssignment.update({
          where: { id: payload.currentAssignmentId },
          data: { endedAt: payload.effectiveAt },
        });
        await tx.bed.update({ where: { id: payload.currentBedId }, data: { status: 'AVAILABLE' } });
        await tx.bedAssignment.create({
          data: {
            admissionId: payload.admissionId,
            bedId: payload.targetBedId,
            startedAt: payload.effectiveAt,
            createdById: payload.createdById,
          },
        });
        await tx.bed.update({ where: { id: payload.targetBedId }, data: { status: 'OCCUPIED' } });
        return tx.admission.findUniqueOrThrow({
          where: { id: payload.admissionId },
          include: ADMISSION_INCLUDE,
        });
      });

      return this.toAdmissionRecord(admission);
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  /**
   * Discharge also writes the SATUSEHAT outbox row for the source encounter
   * when the doctor already closed it (P10-T09). Writing another module's
   * table here is deliberate, for the same reason `closeEncounter` writes this
   * one: the outbox guarantee is that the event and its queue entry commit or
   * roll back together, and for an inpatient stay the event that ends the
   * reportable episode is the discharge, not the note. An encounter still
   * IN_PROGRESS enqueues at its own close instead, which by then finds a
   * discharged admission and proceeds normally.
   */
  async dischargeAdmission(payload: DischargeAdmissionRecordPayload): Promise<AdmissionRecord> {
    const admission = await this.prisma.executeTransaction(async (tx) => {
      await tx.bedAssignment.update({
        where: { id: payload.currentAssignmentId },
        data: { endedAt: payload.dischargedAt },
      });
      await tx.bed.update({ where: { id: payload.currentBedId }, data: { status: 'AVAILABLE' } });
      const updated = await tx.admission.update({
        where: { id: payload.admissionId },
        data: {
          status: 'DISCHARGED',
          dischargedAt: payload.dischargedAt,
          dischargeSummary: payload.dischargeSummary,
        },
      });
      await tx.patientProfile.update({
        where: { id: updated.patientId },
        data: { status: 'DISCHARGED' },
      });
      await this.enqueueSatusehatEncounter(tx, updated.sourceEncounterId);
      return tx.admission.findUniqueOrThrow({
        where: { id: payload.admissionId },
        include: ADMISSION_INCLUDE,
      });
    });

    return this.toAdmissionRecord(admission);
  }

  /**
   * Idempotent by the outbox row's unique encounter id: a stay admitted from
   * an encounter that was somehow already enqueued (a discharge reversed and
   * repeated, a cancelled admission re-created) must not queue the visit
   * twice.
   */
  private async enqueueSatusehatEncounter(
    tx: PrismaTransactionClient,
    sourceEncounterId: string | null,
  ): Promise<void> {
    if (sourceEncounterId === null) {
      return;
    }
    const encounter = await tx.encounter.findUnique({
      where: { id: sourceEncounterId },
      select: { status: true },
    });
    if (encounter?.status !== 'FINISHED') {
      return;
    }
    await tx.satusehatSubmission.upsert({
      where: { encounterId: sourceEncounterId },
      create: { encounterId: sourceEncounterId },
      update: {},
    });
  }

  /**
   * A cancellation is a stay that never happened, so the patient goes back to
   * OUT_PATIENT rather than DISCHARGED — the latter would put a discharge in
   * the record for an admission the clinic is saying was an error.
   */
  async cancelAdmission(payload: CancelAdmissionRecordPayload): Promise<AdmissionRecord> {
    const admission = await this.prisma.executeTransaction(async (tx) => {
      if (payload.currentAssignmentId !== null && payload.currentBedId !== null) {
        await tx.bedAssignment.update({
          where: { id: payload.currentAssignmentId },
          data: { endedAt: payload.cancelledAt },
        });
        await tx.bed.update({ where: { id: payload.currentBedId }, data: { status: 'AVAILABLE' } });
      }
      const updated = await tx.admission.update({
        where: { id: payload.admissionId },
        data: {
          status: 'CANCELLED',
          cancelledAt: payload.cancelledAt,
          cancelReason: payload.cancelReason,
        },
      });
      await tx.patientProfile.update({
        where: { id: updated.patientId },
        data: { status: 'OUT_PATIENT' },
      });
      return tx.admission.findUniqueOrThrow({
        where: { id: payload.admissionId },
        include: ADMISSION_INCLUDE,
      });
    });

    return this.toAdmissionRecord(admission);
  }

  async updateAdmission(payload: UpdateAdmissionRecordPayload): Promise<AdmissionRecord> {
    const { id, ...changes } = payload;
    const updated = await this.prisma.admission.update({
      where: { id },
      data: changes,
      include: ADMISSION_INCLUDE,
    });

    return this.toAdmissionRecord(updated);
  }

  private buildListFilter(params: ListAdmissionsParams) {
    const { status, patientId, admittingDoctorId, wardId, search, ownerUserId } = params;

    return {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(admittingDoctorId ? { admittingDoctorId } : {}),
      ...(wardId
        ? { bedAssignments: { some: { endedAt: null, bed: { room: { wardId } } } } }
        : {}),
      ...(search
        ? {
            OR: [
              { patient: { fullName: { contains: search, mode: 'insensitive' as const } } },
              { patient: { mrn: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...this.buildOwnerFilter(ownerUserId),
    };
  }

  private buildOwnerFilter(ownerUserId?: string) {
    if (!ownerUserId) {
      return {};
    }
    return {
      AND: [
        {
          OR: [
            { patient: { ownerUserId } },
            { admittingDoctor: { ownerUserId } },
            {
              patient: {
                doctors: { some: { unassignedAt: null, doctor: { ownerUserId } } },
              },
            },
          ],
        },
      ],
    };
  }

  private mapUniqueViolation(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION_CODE) {
      const target = err.meta?.target;
      const targets = Array.isArray(target) ? target.map(String) : [String(target)];
      return new AdmissionConflictError(
        targets.some((name) => name.includes(BED_OPEN_ASSIGNMENT_INDEX))
          ? 'bed-occupied'
          : 'patient-already-admitted',
      );
    }
    return err;
  }

  private toAdmissionRecord(row: AdmissionRow): AdmissionRecord {
    return {
      id: row.id,
      patientId: row.patientId,
      patientMrn: row.patient.mrn,
      patientFullName: row.patient.fullName,
      patientOwnerUserId: row.patient.ownerUserId,
      admittingDoctorId: row.admittingDoctorId,
      admittingDoctorName: row.admittingDoctor.fullName,
      admittingDoctorOwnerUserId: row.admittingDoctor.ownerUserId,
      sourceEncounterId: row.sourceEncounterId,
      status: row.status,
      reason: row.reason,
      admittedAt: row.admittedAt,
      dischargedAt: row.dischargedAt,
      dischargeSummary: row.dischargeSummary,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      bedAssignments: row.bedAssignments.map((assignment) => ({
        id: assignment.id,
        admissionId: assignment.admissionId,
        startedAt: assignment.startedAt,
        endedAt: assignment.endedAt,
        bed: {
          id: assignment.bed.id,
          code: assignment.bed.code,
          roomId: assignment.bed.roomId,
          roomCode: assignment.bed.room.code,
          roomName: assignment.bed.room.name,
          roomClass: assignment.bed.room.roomClass,
          wardId: assignment.bed.room.ward.id,
          wardCode: assignment.bed.room.ward.code,
          wardName: assignment.bed.room.ward.name,
        },
      })),
    };
  }
}
