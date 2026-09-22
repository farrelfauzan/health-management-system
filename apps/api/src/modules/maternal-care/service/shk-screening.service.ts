import {
  ListShkScreeningsQuery,
  MaternalDueReach,
  RecordShkResultInput,
  RecordShkSampleInput,
  RecordShkSentInput,
  ShkScreeningRecord,
  ShkScreeningView,
  computeShkRepeatWindow,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { ShkScreeningRepository } from '../repository/shk-screening.repository';
import { ShkRecallNotificationService } from './shk-recall-notification.service';
import { toShkScreeningView } from './to-shk-screening-view';

const AUDIT_RESOURCE = 'ShkScreening';

/** The results that send the baby back for another heel prick. */
const REPEAT_SAMPLE_RESULTS: readonly string[] = ['RECALL', 'INVALID_SAMPLE'];

/**
 * SHK (congenital hypothyroidism) screening (P25-T10): the heel prick due 48
 * to 72 hours after birth, the card sent to the referral laboratory, and the
 * answer — which, for RECALL or INVALID_SAMPLE, opens the next sample.
 *
 * Authorised like the rest of maternal care (P25-T06), on the `Encounter`
 * subject. Under OWN scope the caller must be a clinician, and reaches the
 * babies she delivered or whose mother (or who herself) is assigned to her;
 * `encounter.read:own` is also a PATIENT grant, and a worklist of other
 * people's babies is not something a patient may read.
 *
 * Nothing here refuses a late sample. An overdue heel prick is still the
 * right thing to do and to record; the worklist is how lateness is seen.
 */
@Injectable()
export class ShkScreeningService {
  constructor(
    private readonly shkScreeningRepository: ShkScreeningRepository,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly shkRecallNotificationService: ShkRecallNotificationService,
    private readonly auditService: AuditService,
  ) {}

  async listWorklist(
    query: ListShkScreeningsQuery,
    currentUser: CurrentUser,
  ): Promise<ShkScreeningView[]> {
    const reachDoctorId = await this.resolveReachDoctorId(currentUser, 'read');
    const now = new Date();
    const records = await this.shkScreeningRepository.listWorklist({
      filter: query.status ?? null,
      now,
      reachDoctorId,
    });
    return records.map((record) => toShkScreeningView(record, now));
  }

  /**
   * Every sample not yet taken — upcoming, due or overdue — under an
   * already-resolved reach (P25-T17). A caller under OWN scope with no
   * clinician profile reaches no baby, which is the refusal `listWorklist`
   * makes, answered here as an empty list because the due worklist gathers
   * several sources and one of them having nothing is not an error.
   */
  async listUntakenSamplesWithinReach(reach: MaternalDueReach): Promise<ShkScreeningView[]> {
    if (!reach.hasAny && reach.doctorId === null) {
      return [];
    }
    const now = new Date();
    const records = await this.shkScreeningRepository.listWorklist({
      filter: null,
      now,
      reachDoctorId: reach.hasAny ? null : reach.doctorId,
    });
    return records
      .filter((record) => record.sampleTakenAt === null)
      .map((record) => toShkScreeningView(record, now));
  }

  async recordSample(
    id: string,
    payload: RecordShkSampleInput,
    currentUser: CurrentUser,
  ): Promise<ShkScreeningView> {
    const screening = await this.findWritableOrThrow(id, currentUser);
    const takenAt = new Date(payload.takenAt);
    this.assertNotBefore(takenAt, screening.newbornCareRecord.deliveryRecord.birthAt, 'takenAt');
    const isRecorded = await this.shkScreeningRepository.recordSample({
      id,
      takenAt,
      takenById: currentUser.sub,
    });
    if (!isRecorded) {
      throw new ConflictException({
        code: 'SHK_SAMPLE_ALREADY_TAKEN',
        message: 'This SHK sample has already been recorded as taken',
      });
    }
    await this.recordAudit('SHK_SAMPLE_TAKEN', screening, currentUser, {
      sequence: String(screening.sequence),
    });
    return this.readView(id);
  }

  async recordSent(
    id: string,
    payload: RecordShkSentInput,
    currentUser: CurrentUser,
  ): Promise<ShkScreeningView> {
    const screening = await this.findWritableOrThrow(id, currentUser);
    const takenAt = this.requireSampleTaken(screening);
    const sentAt = new Date(payload.sentAt);
    this.assertNotBefore(sentAt, takenAt, 'sentAt');
    const isRecorded = await this.shkScreeningRepository.recordSent({
      id,
      sentAt,
      laboratoryName: payload.laboratoryName,
    });
    if (!isRecorded) {
      throw new ConflictException({
        code: 'SHK_SAMPLE_ALREADY_SENT',
        message: 'This SHK sample has already been sent or resulted',
      });
    }
    return this.readView(id);
  }

  async recordResult(
    id: string,
    payload: RecordShkResultInput,
    currentUser: CurrentUser,
  ): Promise<ShkScreeningView> {
    const screening = await this.findWritableOrThrow(id, currentUser);
    const takenAt = this.requireSampleTaken(screening);
    const receivedAt = new Date(payload.receivedAt);
    this.assertNotBefore(receivedAt, takenAt, 'receivedAt');
    const needsRepeat = REPEAT_SAMPLE_RESULTS.includes(payload.result);
    const outcome = await this.shkScreeningRepository.recordResult({
      id,
      receivedAt,
      result: payload.result,
      notes: payload.notes ?? null,
      nextSample: needsRepeat
        ? { sequence: screening.sequence + 1, ...computeShkRepeatWindow(receivedAt) }
        : null,
    });
    if (outcome === null) {
      throw new ConflictException({
        code: 'SHK_RESULT_ALREADY_RECORDED',
        message: 'A result has already been recorded for this SHK sample',
      });
    }
    await this.recordAudit('SHK_RESULT_RECORDED', screening, currentUser, {
      sequence: String(screening.sequence),
      result: payload.result,
      nextScreeningId: outcome.nextScreeningId ?? '',
    });
    if (needsRepeat) {
      await this.announceRecall(screening);
    }
    return this.readView(id);
  }

  private async announceRecall(screening: ShkScreeningRecord): Promise<void> {
    const delivery = screening.newbornCareRecord.deliveryRecord;
    await this.shkRecallNotificationService.notifyRecall({
      attendantUserId: delivery.attendantDoctor.ownerUserId,
      motherPatientId: delivery.pregnancyEpisode.patientId,
      motherName: delivery.pregnancyEpisode.patient.fullName,
      sequence: screening.sequence + 1,
    });
  }

  /**
   * The caller's reach: null under ANY scope (every baby), otherwise the
   * clinician profile OWN reach is measured from. An OWN holder with no
   * clinician profile — a patient — is refused outright.
   */
  private async resolveReachDoctorId(
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<string | null> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, action);
    if (scope.hasAny) {
      return null;
    }
    const doctorId = await this.shkScreeningRepository.findActiveDoctorIdByOwnerUserId(
      currentUser.sub,
    );
    if (doctorId === null) {
      throw new ForbiddenException('SHK screening is recorded by clinicians');
    }
    return doctorId;
  }

  private async findWritableOrThrow(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ShkScreeningRecord> {
    const reachDoctorId = await this.resolveReachDoctorId(currentUser, 'write');
    const screening = await this.shkScreeningRepository.findById(id);
    if (screening === null) {
      throw new NotFoundException('SHK screening not found');
    }
    if (reachDoctorId === null) {
      return screening;
    }
    if (!(await this.shkScreeningRepository.isWithinReach(id, reachDoctorId))) {
      throw new ForbiddenException('You are not allowed to record this SHK screening');
    }
    return screening;
  }

  private requireSampleTaken(screening: ShkScreeningRecord): Date {
    if (screening.sampleTakenAt !== null) {
      return screening.sampleTakenAt;
    }
    throw new UnprocessableEntityException({
      code: 'SHK_SAMPLE_NOT_TAKEN',
      message: 'Record the heel prick before sending the card or recording a result',
    });
  }

  private assertNotBefore(instant: Date, earliest: Date, field: string): void {
    if (instant.getTime() >= earliest.getTime()) {
      return;
    }
    throw new UnprocessableEntityException({
      code: 'SHK_TIME_OUT_OF_ORDER',
      message: 'This time is earlier than the step it follows',
      errors: { [field]: earliest.toISOString() },
    });
  }

  private async readView(id: string): Promise<ShkScreeningView> {
    const record = await this.shkScreeningRepository.findById(id);
    if (record === null) {
      throw new NotFoundException('SHK screening not found');
    }
    return toShkScreeningView(record, new Date());
  }

  private async recordAudit(
    action: 'SHK_SAMPLE_TAKEN' | 'SHK_RESULT_RECORDED',
    screening: ShkScreeningRecord,
    currentUser: CurrentUser,
    metadata: Record<string, string>,
  ): Promise<void> {
    const newborn = screening.newbornCareRecord;
    await this.auditService.record({
      action,
      resource: AUDIT_RESOURCE,
      resourceId: screening.id,
      actorUserId: currentUser.sub,
      patientId: newborn.newbornPatientId ?? newborn.deliveryRecord.pregnancyEpisode.patientId,
      metadata: { newbornCareRecordId: newborn.id, ...metadata },
    });
  }
}
