import { Injectable } from '@nestjs/common';

import {
  ListProspectiveMatchCandidatesParams,
  ListProspectivePatientsParams,
  LinkProspectivePatientParams,
  ProspectiveMatchCandidateRow,
  ProspectivePatientListPage,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppointmentStatus, Prisma } from '../../../generated/prisma/client';

/**
 * A booking in one of these states is over, and a record whose only booking
 * is over has nothing riding on it. Neither the open count nor the "upcoming"
 * booking looks at them.
 */
const CLOSED_APPOINTMENT_STATUSES: AppointmentStatus[] = ['CANCELLED', 'REJECTED'];

/**
 * The counter's half of the prospective-patient table (`P17-T04`).
 *
 * Separate from {@link ProspectivePatientRepository}, which is the chatbot's
 * half and states as its one invariant that it never reads or writes
 * `PatientProfile`. This one has to: the whole job here is deciding whether
 * the person at the counter is already in the registry, and then either
 * pointing their booking at the record they already have or at the one that is
 * about to be created for them.
 *
 * The link below writes across two tables in one transaction, which is wider
 * than a module repository usually reaches — the same shape, and the same
 * justification, as `ChannelArrivalRepository.mergeDraftIntoPatient`: a link
 * that half-happened would leave a booking pointing at a record the desk has
 * already crossed off its worklist.
 */
@Injectable()
export class ProspectiveArrivalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * The people the clinic has not registered yet, one page at a time.
   *
   * Oldest enquiry first by default rather than newest, unlike the chat-side
   * lookup: this is a worklist, and the record that has been waiting longest
   * is the one closest to expiring unresolved. The back office (`P19-T08`) can
   * flip that or order by the expiry itself; either way the count is taken
   * over the same filter so the page numbers and the tab badge agree.
   *
   * The name and phone halves of the search are two `OR` arms on purpose: the
   * stored number is normalised digits, so the phone side compares digits the
   * service already normalised, and a name never accidentally matches a phone.
   */
  async listProspectivePatients(
    params: ListProspectivePatientsParams,
  ): Promise<ProspectivePatientListPage> {
    const where = buildProspectivePatientWhere(params);
    const [rows, total] = await Promise.all([
      this.prismaService.prospectivePatient.findMany({
        where,
        orderBy: params.sort === 'expiresAt' ? { expiresAt: params.order } : { createdAt: params.order },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          channel: true,
          status: true,
          patientId: true,
          expiresAt: true,
          createdAt: true,
          patient: { select: { mrn: true } },
          appointments: {
            where: {
              deletedAt: null,
              status: { notIn: CLOSED_APPOINTMENT_STATUSES },
              scheduledAt: { gte: params.upcomingFrom },
            },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
            select: { id: true, scheduledAt: true, doctor: { select: { fullName: true } } },
          },
          _count: {
            select: {
              appointments: {
                where: { deletedAt: null, status: { notIn: CLOSED_APPOINTMENT_STATUSES } },
              },
            },
          },
        },
      }),
      this.prismaService.prospectivePatient.count({ where }),
    ]);
    return { rows, total };
  }

  async findById(prospectivePatientId: string) {
    return this.prismaService.prospectivePatient.findUnique({
      where: { id: prospectivePatientId },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        status: true,
        patientId: true,
      },
    });
  }

  async findPatientSummary(patientId: string) {
    return this.prismaService.patientProfile.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, mrn: true, fullName: true, isActive: true },
    });
  }

  /**
   * Registry rows the person at the counter might already be.
   *
   * A union of three independent lookups rather than one clever query, because
   * the three are answering different questions and the service scores them
   * differently: an exact NIK hit, an exact registered-number hit, and a
   * name-ish text search. Running them separately is also what lets the phone
   * lookup normalise on both sides — the stored column is whatever a clerk
   * typed years ago, and comparing it raw against a chatbot's normalised
   * number would miss `0812…` against `62812…` every time.
   *
   * Drafts are **not** excluded, unlike the merge-candidate query: a chat
   * booking taken before `P17-T03` created a draft profile with a real MRN,
   * and the person standing at the counter may well be that draft. Linking to
   * it is the right answer and spends nothing.
   */
  async findMatchCandidates(
    params: ListProspectiveMatchCandidatesParams,
  ): Promise<ProspectiveMatchCandidateRow[]> {
    const [byNik, byPhone, bySearch] = await Promise.all([
      params.nikIndex === undefined
        ? []
        : this.prismaService.patientProfile.findMany({
            where: { deletedAt: null, isActive: true, nikIndex: params.nikIndex },
            take: params.limit,
            select: MATCH_CANDIDATE_SELECT,
          }),
      this.findByNormalisedPhoneNumber(params.normalisedPhoneNumber, params.limit),
      params.search === undefined
        ? []
        : this.prismaService.patientProfile.findMany({
            where: {
              deletedAt: null,
              isActive: true,
              OR: [
                { fullName: { contains: params.search, mode: 'insensitive' } },
                { mrn: { contains: params.search, mode: 'insensitive' } },
                { phoneNumber: { contains: params.search } },
              ],
            },
            take: params.limit,
            select: MATCH_CANDIDATE_SELECT,
          }),
    ]);
    return dedupeById([...byNik, ...byPhone, ...bySearch]);
  }

  /**
   * Repoints the bookings and marks the record `LINKED`, in one transaction
   * (`P17-T04`).
   *
   * **No MRN is allocated here, and none can be.** That is the difference this
   * endpoint exists to preserve: the person was already in the registry, and
   * the only thing that changes is which record their booking names.
   */
  async linkToPatient(
    params: LinkProspectivePatientParams,
  ): Promise<{ movedAppointments: number }> {
    return this.prismaService.executeTransaction(async (tx) => {
      const moved = await tx.appointment.updateMany({
        where: { prospectivePatientId: params.prospectivePatientId, deletedAt: null },
        // Both columns: the appointment's CHECK allows exactly one of them to
        // be set (`P17-T02`), so repointing without clearing the old side
        // would abort the transaction.
        data: { patientId: params.patientId, prospectivePatientId: null },
      });
      await tx.prospectivePatient.update({
        where: { id: params.prospectivePatientId },
        data: {
          status: 'LINKED',
          patientId: params.patientId,
          convertedById: params.linkedById,
          convertedAt: params.linkedAt,
        },
      });
      return { movedAppointments: moved.count };
    });
  }

  /**
   * Matches the registered number the way `PCS-T07` does: digits only, a
   * leading zero rewritten to the country code, compared on both sides. The
   * stored column keeps whatever was typed, so the normalisation has to happen
   * in SQL rather than in a `where`.
   */
  private async findByNormalisedPhoneNumber(
    normalisedPhoneNumber: string,
    limit: number,
  ): Promise<ProspectiveMatchCandidateRow[]> {
    return this.prismaService.$queryRaw<ProspectiveMatchCandidateRow[]>`
      SELECT "id",
             "mrn",
             "full_name"   AS "fullName",
             "phone_number" AS "phoneNumber",
             "date_of_birth" AS "dateOfBirth",
             "nik_last4"   AS "nikLast4",
             "nik_index"   AS "nikIndex"
      FROM "patient_profiles"
      WHERE "deleted_at" IS NULL
        AND "is_active" = true
        AND regexp_replace(regexp_replace("phone_number", '[^0-9]', '', 'g'), '^0', '62')
            = ${normalisedPhoneNumber}
      ORDER BY "created_at" ASC
      LIMIT ${limit}
    `;
  }
}

/**
 * The filter shared by the page query and its count, so the two can never
 * disagree about how many rows the back office is paging through.
 */
function buildProspectivePatientWhere(
  params: ListProspectivePatientsParams,
): Prisma.ProspectivePatientWhereInput {
  const searchArms: Prisma.ProspectivePatientWhereInput[] = [];
  if (params.nameQuery !== undefined) {
    searchArms.push({ fullName: { contains: params.nameQuery, mode: 'insensitive' } });
  }
  if (params.phoneQuery !== undefined) {
    searchArms.push({ phoneNumber: { contains: params.phoneQuery } });
  }
  return {
    status: params.status,
    ...(params.channel === undefined ? {} : { channel: params.channel }),
    ...(searchArms.length === 0 ? {} : { OR: searchArms }),
  };
}

/**
 * One row per patient, even when two of the three lookups found them.
 *
 * Order matters and is preserved: the NIK results come first, so the strongest
 * evidence for a candidate is the copy that survives and the weaker duplicates
 * are the ones dropped.
 */
function dedupeById(rows: ProspectiveMatchCandidateRow[]): ProspectiveMatchCandidateRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}

/**
 * Blind index and last-four only. The ciphertext is never selected on a search
 * path: deciding whether two people are the same person does not need a
 * decryption key, and reading a NIK back out is the patient-edit screen's job,
 * behind `patient.read-identifier` and an audit row.
 */
const MATCH_CANDIDATE_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  phoneNumber: true,
  dateOfBirth: true,
  nikLast4: true,
  nikIndex: true,
} as const;
