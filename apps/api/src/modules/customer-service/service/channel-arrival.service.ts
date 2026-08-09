import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CHANNEL_DRAFT_REQUIRED_FIELDS,
  ChannelArrivalListView,
  ChannelArrivalRecord,
  ChannelArrivalView,
  ChannelDraftMergeView,
  ChannelMergeCandidateView,
  getCalendarDateInTimeZone,
  ListChannelArrivalsQueryInput,
  ListChannelMergeCandidatesQueryInput,
  MergeChannelDraftPatientInput,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ChannelArrivalRepository } from '../repository/channel-arrival.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const MS_PER_DAY = 86_400_000;

/**
 * A `@db.Date` column back as the calendar date it is.
 *
 * Prisma hands these back as a UTC midnight, so the ISO string's date part is
 * already the stored day — reading it with local getters is what would shift a
 * birthday by one in a negative-offset timezone.
 */
function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 'YYYY-MM-DD'.length);
}

/**
 * The check-in worklist and the draft merge (`PCS-T08`, strategy §5.2).
 *
 * §5.2 is one sentence — "arrival completes the record" — and it decomposes
 * into exactly two things a front desk has to be able to do. The first is see
 * which of today's arrivals booked from a phone and has a record nobody has
 * ever filled in; that is the list. The second is the case where the person
 * standing there turns out to *already* be a patient — the phone number they
 * typed was a family member's, or verification never happened — and the draft
 * has to become their existing record rather than a second one; that is the
 * merge.
 *
 * **Completing a record is deliberately not here.** The admin enters NIK, BPJS
 * and demographics through the existing patient-edit route, with its own
 * permission, its own validation, and its own identifier-encryption path. A
 * second write path for the same columns is a second place for the encryption
 * rules to drift, and it would let one request both move a booking and rewrite
 * a registry record.
 */
@Injectable()
export class ChannelArrivalService {
  private readonly logger = new Logger(ChannelArrivalService.name);
  private readonly clinicTimeZone: string;

  constructor(
    configService: ConfigService,
    private readonly arrivalRepository: ChannelArrivalRepository,
  ) {
    this.clinicTimeZone =
      configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * The worklist, defaulting to the clinic's today.
   *
   * The default is a day rather than "everything upcoming" because this screen
   * lives on a counter monitor and the question at a counter is who is walking
   * in now. The window is resolved against the clinic timezone, not the
   * server's: a desk in Jakarta reading a UTC "today" would lose its first
   * seven hours of arrivals every morning.
   */
  async listArrivals(query: ListChannelArrivalsQueryInput): Promise<ChannelArrivalListView> {
    const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const from = query.from ?? today;
    const to = query.to ?? from;
    const result = await this.arrivalRepository.listArrivals({
      from: `${from}T00:00:00.000Z`,
      // Exclusive upper bound one day past `to`, so a range of a single date
      // covers that whole date rather than only its first instant.
      to: new Date(Date.parse(`${to}T00:00:00.000Z`) + MS_PER_DAY).toISOString(),
      ...(query.channel === undefined ? {} : { channel: query.channel }),
      ...(query.referenceCode === undefined ? {} : { referenceCode: query.referenceCode }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      limit: query.limit,
    });
    return {
      items: result.items.map((record) => this.toView(record)),
      nextCursor: result.nextCursor,
    };
  }

  /**
   * The records a draft could be merged into.
   *
   * A lookup of its own rather than a reuse of the patient directory, because
   * the directory's list projection carries a name, a status, and a doctor
   * count — and a name is not enough to merge on. Two people called Siti is
   * the ordinary case, so the MRN, the registered number, and the date of
   * birth come back instead: the three things somebody at a counter checks
   * against the card in the person's hand.
   */
  async listMergeCandidates(
    query: ListChannelMergeCandidatesQueryInput,
  ): Promise<ChannelMergeCandidateView[]> {
    const rows = await this.arrivalRepository.listMergeCandidates({
      search: query.search,
      limit: query.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      mrn: row.mrn,
      fullName: row.fullName,
      phoneNumber: row.phoneNumber,
      dateOfBirth: row.dateOfBirth === null ? null : toCalendarDate(row.dateOfBirth),
    }));
  }

  /**
   * Merges a chat-created draft into the patient it should have been.
   *
   * The four refusals below are the whole safety of this endpoint, and each
   * names a different way the wrong record could be destroyed:
   *
   *  - the draft must be a `CHANNEL_BOOKING` record, so this can never be used
   *    to merge two front-desk patients — a genuine duplicate-record merge is a
   *    different, much heavier operation and does not belong on a channel route;
   *  - the target must be a *different*, live record, because merging a record
   *    into itself would soft-delete it while reporting success;
   *  - the target must not itself be a draft, or the desk would be moving a
   *    booking from one incomplete record onto another and clearing nothing;
   *  - the draft must carry no clinical history, because moving encounters and
   *    prescriptions between patients is not something a front-desk button gets
   *    to do silently.
   */
  async mergeDraftPatient(
    draftPatientId: string,
    payload: MergeChannelDraftPatientInput,
    currentUser: CurrentUser,
  ): Promise<ChannelDraftMergeView> {
    if (draftPatientId === payload.targetPatientId) {
      throw new BadRequestException('A draft cannot be merged into itself');
    }
    const draft = await this.arrivalRepository.findArrivalPatientById(draftPatientId);
    if (draft === null) {
      throw new NotFoundException('Draft patient not found');
    }
    if (draft.source !== 'CHANNEL_BOOKING') {
      throw new BadRequestException(
        'Only a chat-created draft can be merged through the arrival worklist',
      );
    }
    const target = await this.arrivalRepository.findArrivalPatientById(payload.targetPatientId);
    if (target === null) {
      throw new NotFoundException('Target patient not found');
    }
    if (target.source === 'CHANNEL_BOOKING') {
      throw new BadRequestException(
        'The target of a merge must be an existing patient record, not another draft',
      );
    }
    const clinicalRecordCount = await this.arrivalRepository.countClinicalRecords(draftPatientId);
    if (clinicalRecordCount > 0) {
      throw new BadRequestException(
        'This draft already has clinical records and cannot be merged automatically',
      );
    }
    const result = await this.arrivalRepository.mergeDraftIntoPatient({
      draftPatientId,
      targetPatientId: payload.targetPatientId,
      now: new Date(),
    });
    // Worth a log line and not only an audit row: a merge is the one action on
    // this surface that retires a record, and an operator investigating "where
    // did MRN x go" should find the answer without reconstructing it from two
    // tables.
    this.logger.log(
      buildSafeErrorLog('cs_channel_draft_merged', {
        draftPatientId,
        targetPatientId: payload.targetPatientId,
        actorUserId: currentUser.sub,
        movedAppointments: result.movedAppointments,
      }),
    );
    return {
      draftPatientId,
      targetPatientId: payload.targetPatientId,
      ...result,
    };
  }

  /**
   * `patientIsDraft` is the worklist's actual predicate, and it is narrower
   * than "the record has empty columns".
   *
   * Only the two columns `PCS-T07` made nullable for chat drafts count: a
   * patient may genuinely have neither a NIK on them nor BPJS coverage, and a
   * worklist that never clears is a worklist people stop reading. The
   * identifiers are still *reported* in `missingFields`, so the desk knows to
   * ask — the difference is between a prompt and a blocker.
   */
  private toView(record: ChannelArrivalRecord): ChannelArrivalView {
    const isDraft =
      record.patientSource === 'CHANNEL_BOOKING' &&
      CHANNEL_DRAFT_REQUIRED_FIELDS.some((field) =>
        record.missingFields.some((missing) => missing === field),
      );
    return {
      appointmentId: record.appointmentId,
      bookingReferenceCode: record.bookingReferenceCode,
      channel: record.channel,
      scheduledAt: record.scheduledAt,
      appointmentStatus: record.appointmentStatus,
      doctorName: record.doctorName,
      specialty: record.specialty,
      patientId: record.patientId,
      patientMrn: record.patientMrn,
      patientFullName: record.patientFullName,
      patientPhoneNumber: record.patientPhoneNumber,
      patientIsDraft: isDraft,
      missingFields: [...record.missingFields],
      createdAt: record.createdAt,
    };
  }
}
