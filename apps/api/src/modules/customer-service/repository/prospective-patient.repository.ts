import { Injectable } from '@nestjs/common';

import {
  ChannelKindValue,
  CreateProspectivePatientParams,
  OverdueProspectivePatientRecord,
  ProspectivePatientRecord,
  ProspectivePatientStatusValue,
  ResolveProspectivePatientParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

type ProspectivePatientRow = {
  id: string;
  fullName: string;
  phoneNumber: string;
  channel: ChannelKindValue;
  externalChatId: string | null;
  status: ProspectivePatientStatusValue;
  patientId: string | null;
  convertedAt: Date | null;
  convertedById: string | null;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * Someone who has asked to become a patient and has not yet arrived
 * (`P17-T01`).
 *
 * The one rule this repository enforces on every caller: **it never allocates
 * an MRN and never touches `PatientProfile`.** That is the entire point of the
 * table. The MRN is allocated at the counter, by the conversion path
 * (`P17-T04`), against a person a human has seen an ID document for.
 *
 * Phone numbers arrive here already normalised. The repository does not
 * normalise them itself, because doing so would leave two places that decide
 * what a canonical number is — `normalizePhoneNumber` and here — and the
 * failure mode of those two disagreeing is a silent duplicate patient record,
 * which PMK 24/2022 retention then makes permanent.
 */
@Injectable()
export class ProspectivePatientRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Opens a record for a booking the chatbot has just taken.
   *
   * Always an insert, never an upsert on the phone number. Two bookings from
   * one number are frequently two people — a parent booking for themselves and
   * then for a child is the ordinary case on this channel, and it is the same
   * reason `ChannelPatientLink` is keyed by `(chat, number)` rather than by
   * chat. Collapsing them here would silently book the second appointment for
   * the first person. Deduplication, if the clinic ever wants it, is a
   * counter-side decision made by a human looking at both names (design Q4).
   */
  async createAwaitingArrival(
    params: CreateProspectivePatientParams,
  ): Promise<ProspectivePatientRecord> {
    const row = await this.prismaService.prospectivePatient.create({
      data: {
        fullName: params.fullName,
        phoneNumber: params.phoneNumber,
        channel: params.channel,
        externalChatId: params.externalChatId,
        expiresAt: params.expiresAt,
      },
    });
    return this.toRecord(row);
  }

  async findById(prospectivePatientId: string): Promise<ProspectivePatientRecord | null> {
    const row = await this.prismaService.prospectivePatient.findUnique({
      where: { id: prospectivePatientId },
    });
    return row === null ? null : this.toRecord(row);
  }

  /**
   * Every record still waiting on this number, newest first.
   *
   * Returns a list rather than one row for the reason {@link
   * createAwaitingArrival} does not upsert: one number legitimately holds
   * several open bookings for several people, and the front desk picks which
   * of them is standing at the counter.
   *
   * Scoped to `AWAITING_ARRIVAL`, so a number whose earlier booking already
   * converted does not drag a resolved record back into the worklist.
   */
  async findAwaitingArrivalByPhoneNumber(
    normalizedPhoneNumber: string,
  ): Promise<ProspectivePatientRecord[]> {
    const rows = await this.prismaService.prospectivePatient.findMany({
      where: { phoneNumber: normalizedPhoneNumber, status: 'AWAITING_ARRIVAL' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: ProspectivePatientRow) => this.toRecord(row));
  }

  /**
   * The person at the counter turned out to be a patient the clinic already
   * has — no MRN was spent.
   */
  async markLinked(params: ResolveProspectivePatientParams): Promise<ProspectivePatientRecord> {
    return this.markResolved(params, 'LINKED');
  }

  /**
   * The person at the counter was genuinely new, and `P17-T04` has just
   * created their `PatientProfile` and allocated the MRN.
   */
  async markConverted(params: ResolveProspectivePatientParams): Promise<ProspectivePatientRecord> {
    return this.markResolved(params, 'CONVERTED');
  }

  /**
   * Unresolved records whose date has passed, with the two appointment counts
   * that decide what happens to each (`P17-T06`).
   *
   * Guarded on `status` as well as `expiresAt`, so a record that resolved to a
   * real patient can never be swept out from under that patient's provenance —
   * `LINKED` and `CONVERTED` rows are past this date and stay forever.
   *
   * Reading rather than updating: the transition to `EXPIRED` and the deletion
   * happen together in {@link purgeOverdueRecord}, per record, so that a row
   * the sweep declines to purge is never left marked `EXPIRED` while a live
   * booking still points at it.
   */
  async findOverdueRecords(params: {
    now: Date;
    limit: number;
  }): Promise<OverdueProspectivePatientRecord[]> {
    const rows = await this.prismaService.prospectivePatient.findMany({
      where: { status: 'AWAITING_ARRIVAL', expiresAt: { lte: params.now } },
      // Oldest first: the rows furthest past their retention date are the ones
      // the clinic has been holding longest without a reason to.
      orderBy: { expiresAt: 'asc' },
      take: params.limit,
      select: {
        id: true,
        appointments: { select: { id: true, status: true, deletedAt: true } },
      },
    });
    return rows.map((row) => toOverdueRecord(row));
  }

  /**
   * Deletes one overdue record, or declines to (`P17-T06`).
   *
   * The live-booking check is repeated **inside the transaction** rather than
   * trusted from {@link findOverdueRecords}. A customer can book between the
   * two calls, and the failure mode of trusting the earlier read is deleting
   * the subject of a booking somebody is about to arrive for.
   *
   * Stale appointments are deleted with the record and this is deliberate, not
   * incidental: `Appointment.prospectivePatient` is `onDelete: Restrict`, so a
   * single cancelled booking would otherwise pin the row — and its name and
   * phone number — in the table forever, which is the exact outcome the
   * retention rule exists to prevent. A cancelled booking by somebody who
   * never became a patient carries the same personal data and no clinical
   * history.
   *
   * The status is set to `EXPIRED` before the delete in the same transaction.
   * The row does not survive to carry it, but a trigger or a replica reading
   * the write stream sees the transition rather than a bare disappearance.
   */
  async purgeOverdueRecord(params: {
    prospectivePatientId: string;
    now: Date;
  }): Promise<boolean> {
    return this.prismaService.executeTransaction(async (tx) => {
      const liveAppointments = await tx.appointment.count({
        where: {
          prospectivePatientId: params.prospectivePatientId,
          deletedAt: null,
          status: { notIn: [...NON_LIVE_APPOINTMENT_STATUSES] },
        },
      });
      if (liveAppointments > 0) {
        return false;
      }
      const record = await tx.prospectivePatient.updateMany({
        where: {
          id: params.prospectivePatientId,
          status: 'AWAITING_ARRIVAL',
          expiresAt: { lte: params.now },
        },
        data: { status: 'EXPIRED' },
      });
      // Somebody resolved it at the counter while the sweep was running. The
      // guarded `updateMany` matched nothing, and nothing is deleted.
      if (record.count === 0) {
        return false;
      }
      await tx.appointment.deleteMany({
        where: { prospectivePatientId: params.prospectivePatientId },
      });
      await tx.prospectivePatient.delete({ where: { id: params.prospectivePatientId } });
      return true;
    });
  }

  private async markResolved(
    params: ResolveProspectivePatientParams,
    status: Extract<ProspectivePatientStatusValue, 'CONVERTED' | 'LINKED'>,
  ): Promise<ProspectivePatientRecord> {
    const row = await this.prismaService.prospectivePatient.update({
      where: { id: params.prospectivePatientId },
      data: {
        status,
        patientId: params.patientId,
        convertedById: params.convertedById,
        convertedAt: params.convertedAt,
      },
    });
    return this.toRecord(row);
  }

  private toRecord(row: ProspectivePatientRow): ProspectivePatientRecord {
    return {
      id: row.id,
      fullName: row.fullName,
      phoneNumber: row.phoneNumber,
      channel: row.channel,
      externalChatId: row.externalChatId,
      status: row.status,
      patientId: row.patientId,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      convertedById: row.convertedById,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * The two statuses that mean a booking is over.
 *
 * Everything else — including `COMPLETED` and `NO_SHOW` — counts as live for
 * the sweep's purposes. A completed appointment against a record still marked
 * `AWAITING_ARRIVAL` means somebody was seen without being registered, which
 * is a data-quality problem for a human to look at, not a row for a background
 * job to delete.
 */
const NON_LIVE_APPOINTMENT_STATUSES = ['CANCELLED', 'REJECTED'] as const;

type OverdueRow = {
  id: string;
  appointments: { id: string; status: string; deletedAt: Date | null }[];
};

function toOverdueRecord(row: OverdueRow): OverdueProspectivePatientRecord {
  const live = row.appointments.filter(
    (appointment) =>
      appointment.deletedAt === null &&
      !NON_LIVE_APPOINTMENT_STATUSES.some((status) => status === appointment.status),
  );
  return {
    id: row.id,
    liveAppointments: live.length,
    staleAppointments: row.appointments.length - live.length,
  };
}
