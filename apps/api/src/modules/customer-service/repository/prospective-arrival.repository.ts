import { Injectable } from '@nestjs/common';

import {
  ListProspectiveMatchCandidatesParams,
  ListProspectivePatientsParams,
  LinkProspectivePatientParams,
  ProspectiveMatchCandidateRow,
  ProspectivePatientListRow,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

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
   * The people the clinic has not registered yet, oldest enquiry first.
   *
   * Oldest first rather than newest, unlike the chat-side lookup: this is a
   * worklist, and the record that has been waiting longest is the one closest
   * to expiring unresolved.
   */
  async listByStatus(params: ListProspectivePatientsParams): Promise<ProspectivePatientListRow[]> {
    return this.prismaService.prospectivePatient.findMany({
      where: { status: params.status },
      orderBy: { createdAt: 'asc' },
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
        _count: {
          select: {
            appointments: {
              where: { deletedAt: null, status: { notIn: ['CANCELLED', 'REJECTED'] } },
            },
          },
        },
      },
    });
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
