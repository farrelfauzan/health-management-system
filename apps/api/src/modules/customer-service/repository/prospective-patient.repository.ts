import { Injectable } from '@nestjs/common';

import {
  ChannelKindValue,
  CreateProspectivePatientParams,
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
   * Marks unresolved records whose date has passed, and reports how many.
   *
   * Guarded on `status` as well as `expiresAt` so a re-run is a no-op and a
   * resolved record can never be expired out from under a real patient's
   * provenance. Purging the marked rows is the sweep's own job (`P17-T06`);
   * this only makes the transition, so that the count is auditable before
   * anything is deleted.
   */
  async expireOverdue(now: Date): Promise<number> {
    const result = await this.prismaService.prospectivePatient.updateMany({
      where: { status: 'AWAITING_ARRIVAL', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
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
