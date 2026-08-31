import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  ConvertProspectivePatientInput,
  LinkProspectivePatientInput,
  ListProspectiveMatchCandidatesQueryInput,
  ListProspectivePatientsQueryInput,
  maskIdentifierLast4,
  ProspectiveArrivalResolutionView,
  ProspectiveMatchCandidateRow,
  ProspectiveMatchCandidateView,
  ProspectiveMatchReasonValue,
  ProspectivePatientListRow,
  ProspectivePatientView,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { ProspectiveArrivalRepository } from '../repository/prospective-arrival.repository';
import { normalizePhoneNumber } from './normalize-phone-number';
import { scoreNameSimilarity } from './score-name-similarity';

const PROSPECTIVE_AUDIT_RESOURCE = 'ProspectivePatient';

/**
 * How much each kind of evidence is worth when ordering candidates.
 *
 * The gap between a NIK and a phone number is deliberately larger than the gap
 * between a phone number and a name: a NIK is issued to one person, a phone is
 * a household object that a spouse or a child books from, and a name is a
 * coincidence. Two people called Siti at the same clinic is the ordinary case,
 * so a perfect name match alone must never outrank a registered number.
 */
const MATCH_WEIGHTS = {
  NIK_EXACT: 100,
  PHONE_EXACT: 50,
  /** Multiplied by the 0…1 similarity, so a perfect name is worth 25. */
  NAME_SIMILAR: 25,
} as const;

/** Below this the names have nothing in common worth showing a clerk. */
const MIN_NAME_SIMILARITY = 0.5;

/**
 * The counter turning a prospective record into a patient (`P17-T04`,
 * strategy §5.2).
 *
 * **This is the one place in the system where arriving at the clinic spends an
 * MRN**, and everything in this service is arranged around making that spend
 * deliberate. `P17-T01` opened the prospective table so a chat booking would
 * stop creating half-empty patient records; that only pays off if the counter
 * looks for an existing record before creating a new one, which is why
 * {@link listMatchCandidates} exists and why the frontend disables *create
 * new* until it has run. A returning patient who books from a new phone is not
 * an edge case — it is the failure this whole flow was built to prevent, and a
 * second record for them is permanent under PMK 24/2022 retention.
 *
 * The two resolutions are deliberately different endpoints with different
 * permissions. Linking is `patient.update`: it moves a booking. Converting is
 * `patient.create`: it registers a person. Folding them into one "resolve"
 * route would make the difference a body field, and the difference is the
 * entire point.
 *
 * **Not gated on the `cs-channels` feature.** The worklist that leads here is,
 * because it is a view of a live channel — but a clinic that switches the
 * channel off still has people who booked through it standing at the counter,
 * and their bookings would otherwise be unresolvable and their appointments
 * stranded on a record nothing can convert.
 */
@Injectable()
export class ProspectiveArrivalService {
  private readonly logger = new Logger(ProspectiveArrivalService.name);

  constructor(
    private readonly arrivalRepository: ProspectiveArrivalRepository,
    private readonly patientManagementService: PatientManagementService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
    private readonly auditService: AuditService,
  ) {}

  async listProspectivePatients(
    query: ListProspectivePatientsQueryInput,
  ): Promise<ProspectivePatientView[]> {
    const rows = await this.arrivalRepository.listByStatus({
      status: query.status,
      limit: query.limit,
    });
    return rows.map((row) => toProspectiveView(row));
  }

  /**
   * The search that must happen before an MRN is spent.
   *
   * It runs with no query at all, seeded from the record's own name and phone
   * number, because a search the clerk has to think of is a search the clerk
   * skips when the queue is six deep. What they type on top of that is the
   * name the person actually gave and the NIK off the ID document in their
   * hand.
   *
   * The NIK is hashed to its blind index here and never travels further: the
   * repository compares one hash against another, and no route on this
   * controller can return a plaintext identifier.
   */
  async listMatchCandidates(
    prospectivePatientId: string,
    query: ListProspectiveMatchCandidatesQueryInput,
  ): Promise<ProspectiveMatchCandidateView[]> {
    const prospective = await this.getProspectiveOrThrow(prospectivePatientId);
    const nikIndex =
      query.nik === undefined ? undefined : this.identifierCrypto.computeBlindIndex(query.nik);
    const normalisedPhoneNumber = normalizePhoneNumber(prospective.phoneNumber);
    const rows = await this.arrivalRepository.findMatchCandidates({
      normalisedPhoneNumber,
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(nikIndex === undefined ? {} : { nikIndex }),
      limit: query.limit,
    });
    return rows
      .map((row) =>
        this.scoreCandidate(row, {
          fullName: prospective.fullName,
          normalisedPhoneNumber,
          ...(nikIndex === undefined ? {} : { nikIndex }),
        }),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit);
  }

  /**
   * The person at the counter is somebody the clinic already has.
   *
   * The target must be a live record: linking onto a soft-deleted or
   * deactivated patient would move the booking somewhere nobody is looking,
   * and the desk would read the success message and check the person in
   * against a record that no longer appears in any list.
   */
  async linkToExistingPatient(
    prospectivePatientId: string,
    payload: LinkProspectivePatientInput,
    currentUser: CurrentUser,
  ): Promise<ProspectiveArrivalResolutionView> {
    await this.getAwaitingArrivalOrThrow(prospectivePatientId);
    const patient = await this.arrivalRepository.findPatientSummary(payload.patientId);

    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }

    if (!patient.isActive) {
      throw new BadRequestException('A booking cannot be linked to a deactivated patient record');
    }

    const result = await this.arrivalRepository.linkToPatient({
      prospectivePatientId,
      patientId: patient.id,
      linkedById: currentUser.sub,
      linkedAt: new Date(),
    });
    // `UPDATE` rather than `CREATE`, and naming the prospective record rather
    // than the patient: nothing about the patient changed, and what an
    // investigator needs to find later is which enquiry was decided to be this
    // person.
    await this.auditService.record({
      action: 'UPDATE',
      resource: PROSPECTIVE_AUDIT_RESOURCE,
      resourceId: prospectivePatientId,
      patientId: patient.id,
      actorUserId: currentUser.sub,
      metadata: {
        resolution: 'LINKED',
        movedAppointments: result.movedAppointments,
      },
    });
    this.logger.log(
      buildSafeErrorLog('cs_prospective_patient_linked', {
        prospectivePatientId,
        patientId: patient.id,
        actorUserId: currentUser.sub,
        movedAppointments: result.movedAppointments,
      }),
    );
    return {
      prospectivePatientId,
      resolution: 'LINKED',
      patientId: patient.id,
      mrn: patient.mrn,
      patientFullName: patient.fullName,
      movedAppointments: result.movedAppointments,
    };
  }

  /**
   * The person at the counter is genuinely new, so this is where the MRN is
   * spent.
   *
   * The create is delegated to `PatientManagementService` rather than done
   * here, and that is the `PCS-T08` rule holding: the registry's permission
   * check, its privacy-notice evidence rules, its identifier validation, and
   * its encryption path all live on the other side of that call, and a
   * conversion that assembled its own insert would be a second write path for
   * the encrypted columns. The transaction reaches back across the boundary —
   * the appointments are repointed and the record marked `CONVERTED` inside
   * the same transaction that allocates the number — so a failure anywhere
   * rolls the MRN back rather than burning it.
   */
  async convertToNewPatient(
    prospectivePatientId: string,
    payload: ConvertProspectivePatientInput,
    currentUser: CurrentUser,
  ): Promise<ProspectiveArrivalResolutionView & { identifierWarnings: string[] }> {
    await this.getAwaitingArrivalOrThrow(prospectivePatientId);

    const result = await this.patientManagementService.createPatientFromProspective(
      payload,
      prospectivePatientId,
      currentUser,
    );
    await this.auditService.record({
      action: 'CREATE',
      resource: PROSPECTIVE_AUDIT_RESOURCE,
      resourceId: prospectivePatientId,
      patientId: result.patient.id,
      actorUserId: currentUser.sub,
      metadata: {
        resolution: 'CONVERTED',
        mrn: result.patient.mrn,
        movedAppointments: result.movedAppointments,
      },
    });
    this.logger.log(
      buildSafeErrorLog('cs_prospective_patient_converted', {
        prospectivePatientId,
        patientId: result.patient.id,
        actorUserId: currentUser.sub,
        movedAppointments: result.movedAppointments,
      }),
    );
    return {
      prospectivePatientId,
      resolution: 'CONVERTED',
      patientId: result.patient.id,
      mrn: result.patient.mrn,
      patientFullName: result.patient.fullName,
      movedAppointments: result.movedAppointments,
      identifierWarnings: result.identifierWarnings,
    };
  }

  /**
   * Turns one registry row into a scored candidate.
   *
   * A row reaches here because *some* lookup found it, so the reasons are
   * re-derived rather than trusted from which query produced it — the phone
   * search and the free-text search overlap, and a candidate that matched the
   * typed text but not the registered number must not be presented as a phone
   * match.
   *
   * A row can legitimately end with no reasons and a score of zero: the clerk
   * typed an MRN, and it matched nothing about the person the chat described.
   * It is still shown — they typed it — but last, and claiming nothing.
   */
  private scoreCandidate(
    row: ProspectiveMatchCandidateRow,
    against: { fullName: string; normalisedPhoneNumber: string; nikIndex?: string },
  ): ProspectiveMatchCandidateView {
    const reasons: ProspectiveMatchReasonValue[] = [];
    let score = 0;

    if (against.nikIndex !== undefined && row.nikIndex === against.nikIndex) {
      reasons.push('NIK_EXACT');
      score += MATCH_WEIGHTS.NIK_EXACT;
    }

    if (normalizePhoneNumber(row.phoneNumber) === against.normalisedPhoneNumber) {
      reasons.push('PHONE_EXACT');
      score += MATCH_WEIGHTS.PHONE_EXACT;
    }

    const nameSimilarity = scoreNameSimilarity(row.fullName, against.fullName);

    if (nameSimilarity >= MIN_NAME_SIMILARITY) {
      reasons.push('NAME_SIMILAR');
      score += Math.round(MATCH_WEIGHTS.NAME_SIMILAR * nameSimilarity);
    }

    return { ...toCandidateView(row), score, reasons };
  }

  private async getProspectiveOrThrow(prospectivePatientId: string) {
    const prospective = await this.arrivalRepository.findById(prospectivePatientId);

    if (prospective === null) {
      throw new NotFoundException('Prospective patient not found');
    }

    return prospective;
  }

  /**
   * Refuses a record that has already been resolved or has expired.
   *
   * Without this, a second click on a stale screen would convert an
   * already-converted record a second time and allocate a second MRN for one
   * person — the exact duplicate this flow exists to prevent, produced by the
   * flow itself.
   */
  private async getAwaitingArrivalOrThrow(prospectivePatientId: string) {
    const prospective = await this.getProspectiveOrThrow(prospectivePatientId);

    if (prospective.status !== 'AWAITING_ARRIVAL') {
      throw new BadRequestException(
        `This booking has already been resolved (${prospective.status.toLowerCase()})`,
      );
    }

    return prospective;
  }
}

function toProspectiveView(row: ProspectivePatientListRow): ProspectivePatientView {
  return {
    id: row.id,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    channel: row.channel,
    status: row.status,
    patientId: row.patientId,
    openAppointments: row._count.appointments,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toCandidateView(
  row: ProspectiveMatchCandidateRow,
): Omit<ProspectiveMatchCandidateView, 'score' | 'reasons'> {
  return {
    id: row.id,
    mrn: row.mrn,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    // A `@db.Date` column: the ISO string's date part is already the stored
    // day, and reading it with local getters would shift a birthday by one in
    // a negative-offset timezone.
    dateOfBirth: row.dateOfBirth === null ? null : row.dateOfBirth.toISOString().slice(0, 10),
    nikMasked: maskIdentifierLast4(row.nikLast4) ?? null,
  };
}
