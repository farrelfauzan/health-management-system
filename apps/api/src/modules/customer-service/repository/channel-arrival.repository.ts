import { Injectable } from '@nestjs/common';

import {
  CHANNEL_DRAFT_MISSING_FIELDS,
  ChannelArrivalRecord,
  ChannelDraftMergeResult,
  ChannelDraftMissingFieldValue,
  ChannelKindValue,
  ListChannelArrivalsParams,
  ListChannelMergeCandidatesParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The columns a chat-created draft leaves empty, and how to read each one.
 *
 * A table rather than a chain of `if`s so the set stays in lockstep with
 * {@link CHANNEL_DRAFT_MISSING_FIELDS}: adding a field to the shared list
 * without teaching this map to read it is a compile error, not a field that
 * silently never appears on a worklist row.
 *
 * The identifiers are read through their **blind index** columns rather than
 * their ciphertext, because "does this patient have a NIK" is answerable
 * without a decryption key — and a worklist that had to decrypt to render a
 * checklist would be a screen with the identifier key in its request path.
 */
const MISSING_FIELD_READERS: Record<
  ChannelDraftMissingFieldValue,
  (patient: ArrivalPatientRow) => boolean
> = {
  dateOfBirth: (patient) => patient.dateOfBirth === null,
  sex: (patient) => patient.sex === null,
  address: (patient) => patient.address === null || patient.address.trim() === '',
  nik: (patient) => patient.nikIndex === null,
  bpjsNumber: (patient) => patient.bpjsNumberIndex === null,
};

type ArrivalPatientRow = {
  id: string;
  mrn: string;
  fullName: string;
  phoneNumber: string;
  source: 'FRONT_DESK' | 'CHANNEL_BOOKING';
  dateOfBirth: Date | null;
  sex: string | null;
  address: string | null;
  nikIndex: string | null;
  bpjsNumberIndex: string | null;
};

type ArrivalRow = {
  id: string;
  bookingReferenceCode: string | null;
  bookingSource: ChannelKindValue | null;
  scheduledAt: Date;
  status: string;
  createdAt: Date;
  patient: ArrivalPatientRow;
  doctor: { fullName: string; specialty: { name: string } };
};

/**
 * The arrival worklist and the draft merge (`PCS-T08`, strategy §5.2).
 *
 * This repository reads `appointments` and `patient_profiles` and writes across
 * four tables, which is wider than a module repository usually reaches — the
 * same shape `registration-flow`'s repository already has, and for the same
 * reason. A merge that half-happened would leave a booking pointing at a
 * soft-deleted patient, so the four writes have to be one transaction, and a
 * transaction cannot be assembled from calls into three other modules'
 * services.
 */
@Injectable()
export class ChannelArrivalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Channel-sourced bookings in the window, most imminent first.
   *
   * Filtered to `bookingSource != null` in SQL rather than by reading the
   * patient's `source`: provenance belongs to the booking. A *verified*
   * customer's chat booking attaches to a long-standing front-desk record, and
   * keying off the patient would drop exactly those rows — the ones where the
   * desk most needs to know the person booked from a phone rather than at the
   * counter.
   */
  async listArrivals(
    params: ListChannelArrivalsParams,
  ): Promise<{ items: ChannelArrivalRecord[]; nextCursor: string | null }> {
    const cursorRow =
      params.cursor === undefined
        ? null
        : await this.prismaService.appointment.findUnique({
            where: { id: params.cursor },
            select: { scheduledAt: true, id: true },
          });
    const rows = (await this.prismaService.appointment.findMany({
      where: {
        deletedAt: null,
        bookingSource: params.channel === undefined ? { not: null } : params.channel,
        scheduledAt: { gte: new Date(params.from), lt: new Date(params.to) },
        ...(params.referenceCode === undefined
          ? {}
          : { bookingReferenceCode: params.referenceCode }),
        ...(cursorRow === null
          ? {}
          : {
              OR: [
                { scheduledAt: { gt: cursorRow.scheduledAt } },
                { scheduledAt: cursorRow.scheduledAt, id: { gt: cursorRow.id } },
              ],
            }),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      select: ARRIVAL_SELECT,
    })) as ArrivalRow[];
    const items = rows.slice(0, params.limit).map((row) => this.toRecord(row));
    const nextCursor =
      rows.length > params.limit ? (items.at(-1)?.appointmentId ?? null) : null;
    return { items, nextCursor };
  }

  /**
   * Records a draft could legitimately be merged into (§5.2).
   *
   * Pinned to `FRONT_DESK` in the query rather than filtered afterwards, so a
   * desk is never offered another draft as a target: merging one incomplete
   * record into another clears nothing and costs an MRN. Soft-deleted and
   * deactivated records are excluded for the same reason — a merge onto a
   * retired row would hide the booking rather than move it.
   */
  async listMergeCandidates(params: ListChannelMergeCandidatesParams): Promise<ArrivalPatientRow[]> {
    return this.prismaService.patientProfile.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        source: 'FRONT_DESK',
        OR: [
          { fullName: { contains: params.search, mode: 'insensitive' } },
          { mrn: { contains: params.search, mode: 'insensitive' } },
          // Matched on the stored text rather than on normalised digits: this
          // is a staff-typed search box, not §5.1's exact-match registry
          // lookup, and a `contains` over what the front desk typed is what
          // finds a number somebody half-remembers.
          { phoneNumber: { contains: params.search } },
        ],
      },
      orderBy: { fullName: 'asc' },
      take: params.limit,
      select: ARRIVAL_PATIENT_SELECT,
    });
  }

  async findArrivalPatientById(patientId: string): Promise<ArrivalPatientRow | null> {
    return this.prismaService.patientProfile.findFirst({
      where: { id: patientId, deletedAt: null },
      select: ARRIVAL_PATIENT_SELECT,
    });
  }

  /**
   * Whether a draft has acquired anything clinical.
   *
   * A merge only moves bookings and the chat's own rows. If the draft has been
   * seen — an encounter, a prescription, an invoice — then merging it would
   * either orphan that history on a record about to be soft-deleted or move
   * clinical documents between patients through an endpoint written for a
   * front-desk mix-up. Both are refusals, so this is asked before anything is
   * written.
   */
  async countClinicalRecords(patientId: string): Promise<number> {
    const [encounters, prescriptions, invoices] = await Promise.all([
      this.prismaService.encounter.count({ where: { patientId } }),
      this.prismaService.prescription.count({ where: { patientId } }),
      this.prismaService.invoice.count({ where: { patientId } }),
    ]);
    return encounters + prescriptions + invoices;
  }

  /**
   * Repoints a draft's bookings at the real record and retires the draft, in
   * one transaction (§5.2).
   *
   * The draft is **soft-deleted and deactivated, never hard-deleted**. Its MRN
   * was handed out and printed on a confirmation reply, and a reused number is
   * how two people end up sharing a folder; the row also carries the privacy-
   * notice record the channel deferred, which is legal evidence about a real
   * person even though the demographics on it were never filled in.
   */
  async mergeDraftIntoPatient(params: {
    draftPatientId: string;
    targetPatientId: string;
    now: Date;
  }): Promise<ChannelDraftMergeResult> {
    return this.prismaService.executeTransaction(async (tx) => {
      const appointments = await tx.appointment.updateMany({
        where: { patientId: params.draftPatientId },
        data: { patientId: params.targetPatientId },
      });
      const registrations = await tx.registration.updateMany({
        where: { patientId: params.draftPatientId },
        data: { patientId: params.targetPatientId },
      });
      // The chat's claim follows the booking. Leaving it on the retired draft
      // would make the *next* booking from that chat create a second draft —
      // the merge would have to be repeated at every visit.
      const channelLinks = await tx.channelPatientLink.updateMany({
        where: { patientId: params.draftPatientId },
        data: { patientId: params.targetPatientId },
      });
      await tx.patientProfile.update({
        where: { id: params.draftPatientId },
        data: { deletedAt: params.now, isActive: false },
      });
      return {
        movedAppointments: appointments.count,
        movedRegistrations: registrations.count,
        movedChannelLinks: channelLinks.count,
      };
    });
  }

  private toRecord(row: ArrivalRow): ChannelArrivalRecord {
    return {
      appointmentId: row.id,
      bookingReferenceCode: row.bookingReferenceCode,
      // Non-null by the query's own predicate; the fallback exists because the
      // column is nullable in the type and a cast would hide a future query
      // change that stopped filtering.
      channel: row.bookingSource ?? 'WHATSAPP',
      scheduledAt: row.scheduledAt.toISOString(),
      appointmentStatus: row.status,
      doctorName: row.doctor.fullName,
      specialty: row.doctor.specialty.name,
      patientId: row.patient.id,
      patientMrn: row.patient.mrn,
      patientFullName: row.patient.fullName,
      patientPhoneNumber: row.patient.phoneNumber,
      patientSource: row.patient.source,
      missingFields: readMissingFields(row.patient),
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * Which of the worklist's fields this patient is still missing.
 *
 * Exported so the service can re-derive it for a single patient after a merge
 * without repeating the map, and so the unit test can assert the rule against
 * a plain object rather than through a database.
 */
export function readMissingFields(patient: ArrivalPatientRow): ChannelDraftMissingFieldValue[] {
  return CHANNEL_DRAFT_MISSING_FIELDS.filter((field) => MISSING_FIELD_READERS[field](patient));
}

const ARRIVAL_PATIENT_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  phoneNumber: true,
  source: true,
  dateOfBirth: true,
  sex: true,
  address: true,
  // Blind indexes only. The ciphertext columns are never selected here: the
  // worklist asks whether an identifier exists, and reading one would need a
  // key this screen has no business holding.
  nikIndex: true,
  bpjsNumberIndex: true,
} as const;

const ARRIVAL_SELECT = {
  id: true,
  bookingReferenceCode: true,
  bookingSource: true,
  scheduledAt: true,
  status: true,
  createdAt: true,
  patient: { select: ARRIVAL_PATIENT_SELECT },
  doctor: { select: { fullName: true, specialty: { select: { name: true } } } },
} as const;
