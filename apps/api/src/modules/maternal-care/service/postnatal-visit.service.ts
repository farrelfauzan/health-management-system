import {
  buildPostnatalSchedule,
  doesDueWindowTouchRange,
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
  MaternalDueRange,
  MaternalDueReach,
  MaternalDueRecord,
  PostnatalDueBirthRecord,
  PostnatalScheduleEntry,
  EncounterPostnatalVisitResponse,
  EncounterWithRelationsRecord,
  LinkPostnatalVisitInput,
  PostnatalBirthRecord,
  PostnatalExaminationRecord,
  PostnatalExaminationView,
  PostnatalScheduleResponse,
  PostnatalVisitCodeValue,
  PostnatalVisitRecord,
  resolvePostnatalVisitCode,
  UpsertPostnatalExaminationInput,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { PostnatalVisitRepository } from '../repository/postnatal-visit.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const FINISHED_ENCOUNTER_STATUS = 'FINISHED';
const CANCELLED_ENCOUNTER_STATUS = 'CANCELLED';
const MILLISECONDS_PER_DAY = 86_400_000;
/** KF4 closes at the end of day 42; a day more covers the clinic-local shift. */
const POSTNATAL_DUE_LOOKBACK_DAYS = 43;

/**
 * Nifas (KF1–KF4) and neonatal (KN1–KN3) visits after a birth (P25-T12).
 *
 * Authorised like the rest of maternal care, on the `Encounter` subject
 * through `EncounterAccessService` — a postnatal visit is an encounter, and
 * nobody gains reach to one through this module that they lacked through EMR.
 *
 * A visit's code is derived from the encounter's start and the birth time. It
 * is written when the visit is linked, recomputed as long as the encounter is
 * open (a corrected birth time moves it), and frozen when the encounter
 * closes — the code a closed visit was reported under never moves again.
 */
@Injectable()
export class PostnatalVisitService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly postnatalVisitRepository: PostnatalVisitRepository,
    private readonly maternalCareRepository: MaternalCareRepository,
    private readonly encounterAccessService: EncounterAccessService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** The seven windows of the birth that ended this pregnancy. */
  async getSchedule(
    pregnancyEpisodeId: string,
    currentUser: CurrentUser,
  ): Promise<PostnatalScheduleResponse> {
    const birth = await this.postnatalVisitRepository.findBirthByPregnancyEpisodeId(
      pregnancyEpisodeId,
    );
    if (birth === null) {
      throw new NotFoundException('No birth is recorded for this pregnancy episode');
    }
    await this.assertCanReadMother(birth.patientId, currentUser);
    const visits = await this.postnatalVisitRepository.listVisitsByPregnancyEpisodeId(
      pregnancyEpisodeId,
    );
    return {
      pregnancyEpisodeId,
      birthAt: birth.birthAt.toISOString(),
      entries: this.buildScheduleEntries(birth.birthAt, visits, new Date()),
    };
  }

  /**
   * KF/KN windows not yet fulfilled that open or close inside the range
   * (P25-T17), for the due worklist and the reminder worker. Each window is
   * the schedule's own entry, so the worklist and the PNC tab never disagree.
   */
  async listPostnatalDueRecords(
    range: MaternalDueRange,
    reach: MaternalDueReach,
  ): Promise<MaternalDueRecord[]> {
    const rangeStart = getStartOfCalendarDateInTimeZone(range.from, this.clinicTimeZone);
    const births = await this.postnatalVisitRepository.listBirthsForDue({
      bornOnOrAfter: new Date(rangeStart.getTime() - POSTNATAL_DUE_LOOKBACK_DAYS * MILLISECONDS_PER_DAY),
      reach,
    });
    const asOf = new Date();
    const perBirth = await Promise.all(
      births.map(async (birth) => {
        const visits = await this.postnatalVisitRepository.listVisitsByPregnancyEpisodeId(
          birth.pregnancyEpisodeId,
        );
        return this.buildScheduleEntries(birth.birthAt, visits, asOf).flatMap((entry) =>
          this.toPostnatalDueRecords(birth, entry, range),
        );
      }),
    );
    return perBirth.flat();
  }

  private buildScheduleEntries(
    birthAt: Date,
    visits: readonly PostnatalVisitRecord[],
    asOf: Date,
  ): PostnatalScheduleEntry[] {
    return buildPostnatalSchedule({
      birthAt,
      timeZone: this.clinicTimeZone,
      visits: visits.map((visit) => ({
        encounterId: visit.encounterId,
        startedAt: visit.encounterStartedAt,
        subject: visit.subject,
        visitCode: this.resolveEffectiveCode(visit, birthAt),
        isCancelled: visit.encounterStatus === CANCELLED_ENCOUNTER_STATUS,
      })),
      asOf,
    });
  }

  private toPostnatalDueRecords(
    birth: PostnatalDueBirthRecord,
    entry: PostnatalScheduleEntry,
    range: MaternalDueRange,
  ): MaternalDueRecord[] {
    const dueFrom = getCalendarDateInTimeZone(new Date(entry.startsAt), this.clinicTimeZone);
    const dueUntil = getCalendarDateInTimeZone(new Date(entry.endsAt), this.clinicTimeZone);
    if (entry.status === 'FULFILLED' || !doesDueWindowTouchRange({ dueFrom, dueUntil, range })) {
      return [];
    }
    return [
      {
        visitKey: `PNC:${birth.pregnancyEpisodeId}:${entry.code}`,
        source: 'POSTNATAL',
        code: entry.code,
        subject: entry.subject === 'NEWBORN' ? 'NEWBORN' : 'PATIENT',
        patientId: birth.patientId,
        patientName: birth.patientName,
        medicalRecordNumber: birth.medicalRecordNumber,
        dueFrom,
        dueUntil,
      },
    ];
  }

  /** Counts an open encounter as a nifas visit of the mother or a baby's neonatal one. */
  async linkVisit(
    encounterId: string,
    payload: LinkPostnatalVisitInput,
    currentUser: CurrentUser,
  ): Promise<EncounterPostnatalVisitResponse> {
    const encounter = await this.findWritableEncounter(encounterId, currentUser);
    await this.assertNotAlreadyCounted(encounterId);
    const birth = await this.resolveBirthForVisit(encounter, payload);
    if (encounter.startedAt.getTime() < birth.birth.birthAt.getTime()) {
      throw new UnprocessableEntityException({
        code: 'POSTNATAL_VISIT_BEFORE_BIRTH',
        message: 'This encounter started before the birth it would follow',
      });
    }
    const visit = await this.postnatalVisitRepository.createVisit({
      encounterId,
      subject: payload.subject,
      pregnancyEpisodeId: birth.birth.pregnancyEpisodeId,
      newbornCareRecordId: birth.newbornCareRecordId,
      visitCode: this.deriveCode(payload.subject, birth.birth.birthAt, encounter.startedAt),
    });
    if (visit === null) {
      throw this.buildAlreadyLinkedConflict();
    }
    return this.buildVisitResponse(visit, birth.birth.birthAt);
  }

  /** What the encounter workspace's postnatal card reads, or null when unlinked. */
  async getEncounterVisit(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<EncounterPostnatalVisitResponse | null> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const encounter = await this.findEncounterOrThrow(encounterId);
    await this.encounterAccessService.assertCanReadEncounter({ encounter, scope, currentUser });
    const visit = await this.postnatalVisitRepository.findVisitByEncounterId(encounterId);
    if (visit === null) {
      return null;
    }
    const birth = await this.requireBirth(visit.pregnancyEpisodeId);
    return this.buildVisitResponse(visit, birth.birthAt);
  }

  /** Records the nifas examination. Mother's visits only; the vitals are the encounter's. */
  async upsertExamination(
    encounterId: string,
    payload: UpsertPostnatalExaminationInput,
    currentUser: CurrentUser,
  ): Promise<EncounterPostnatalVisitResponse> {
    await this.findWritableEncounter(encounterId, currentUser);
    const visit = await this.postnatalVisitRepository.findVisitByEncounterId(encounterId);
    if (visit === null) {
      throw new ConflictException({
        code: 'POSTNATAL_VISIT_REQUIRED',
        message: 'Count this encounter as a nifas visit before recording the examination',
      });
    }
    if (visit.subject !== 'MOTHER') {
      throw new UnprocessableEntityException({
        code: 'POSTNATAL_EXAMINATION_MOTHER_ONLY',
        message: "The nifas examination is the mother's; a neonatal visit has none",
      });
    }
    await this.assertMedicationExists(payload.vitaminAMedicationId);
    await this.postnatalVisitRepository.upsertExamination({
      postnatalVisitId: visit.id,
      values: this.toExaminationValues(payload),
      recordedById: currentUser.sub,
    });
    const birth = await this.requireBirth(visit.pregnancyEpisodeId);
    return this.buildVisitResponse(visit, birth.birthAt);
  }

  /**
   * Freezes the code as the encounter closes. Called through
   * `MaternalCareService`, which the EMR close already reaches; a no-op for
   * an encounter that is not a postnatal visit.
   */
  async freezeVisitCodeOnEncounterClose(encounterId: string): Promise<void> {
    const visit = await this.postnatalVisitRepository.findVisitByEncounterId(encounterId);
    if (visit === null) {
      return;
    }
    const birth = await this.postnatalVisitRepository.findBirthByPregnancyEpisodeId(
      visit.pregnancyEpisodeId,
    );
    if (birth === null) {
      return;
    }
    await this.postnatalVisitRepository.saveVisitCode({
      encounterId,
      visitCode: this.deriveCode(visit.subject, birth.birthAt, visit.encounterStartedAt),
    });
  }

  private async resolveBirthForVisit(
    encounter: EncounterWithRelationsRecord,
    payload: LinkPostnatalVisitInput,
  ): Promise<{ birth: PostnatalBirthRecord; newbornCareRecordId: string | null }> {
    if (payload.subject === 'MOTHER') {
      const birth = await this.postnatalVisitRepository.findLatestBirthForMother(
        encounter.patientId,
        encounter.startedAt,
      );
      if (birth === null) {
        throw new UnprocessableEntityException({
          code: 'POSTNATAL_BIRTH_NOT_FOUND',
          message: 'This patient has no recorded birth for a nifas visit to follow',
        });
      }
      return { birth, newbornCareRecordId: null };
    }
    const newborn = await this.postnatalVisitRepository.findNewborn({
      newbornCareRecordId: payload.newbornCareRecordId ?? null,
      newbornPatientId: encounter.patientId,
    });
    // The encounter must be the baby's own: a neonatal visit filed on the
    // mother's encounter would report the baby's KN under the mother's record.
    if (newborn === null || newborn.newbornPatientId !== encounter.patientId) {
      throw new UnprocessableEntityException({
        code: 'POSTNATAL_NEWBORN_NOT_FOUND',
        message: "This encounter's patient is not a registered baby of a recorded birth",
      });
    }
    const birth = await this.requireBirth(newborn.pregnancyEpisodeId);
    return { birth, newbornCareRecordId: newborn.newbornCareRecordId };
  }

  private async assertNotAlreadyCounted(encounterId: string): Promise<void> {
    if ((await this.postnatalVisitRepository.findVisitByEncounterId(encounterId)) !== null) {
      throw this.buildAlreadyLinkedConflict();
    }
    if (await this.postnatalVisitRepository.hasAntenatalVisit(encounterId)) {
      throw new ConflictException({
        code: 'ENCOUNTER_IS_ANTENATAL_VISIT',
        message: 'This encounter is already counted as an antenatal visit',
      });
    }
  }

  private buildAlreadyLinkedConflict(): ConflictException {
    return new ConflictException({
      code: 'POSTNATAL_VISIT_ALREADY_LINKED',
      message: 'This encounter is already counted as a postnatal visit',
    });
  }

  private async assertMedicationExists(medicationId: string | null | undefined): Promise<void> {
    if (!medicationId || (await this.postnatalVisitRepository.hasMedication(medicationId))) {
      return;
    }
    throw new UnprocessableEntityException({
      code: 'POSTNATAL_VITAMIN_A_MEDICATION_NOT_FOUND',
      message: 'The vitamin A medication is not in the catalogue',
    });
  }

  private async buildVisitResponse(
    visit: PostnatalVisitRecord,
    birthAt: Date,
  ): Promise<EncounterPostnatalVisitResponse> {
    const examination =
      visit.subject === 'MOTHER'
        ? await this.postnatalVisitRepository.findExamination(visit.id)
        : null;
    return {
      id: visit.id,
      encounterId: visit.encounterId,
      subject: visit.subject,
      pregnancyEpisodeId: visit.pregnancyEpisodeId,
      newbornCareRecordId: visit.newbornCareRecordId,
      visitCode: this.resolveEffectiveCode(visit, birthAt),
      isCodeFrozen: visit.encounterStatus !== 'IN_PROGRESS',
      birthAt: birthAt.toISOString(),
      examination: examination === null ? null : this.toExaminationView(examination),
    };
  }

  /** The stored code once the encounter has closed; the live derivation before. */
  private resolveEffectiveCode(
    visit: PostnatalVisitRecord,
    birthAt: Date,
  ): PostnatalVisitCodeValue | null {
    if (visit.encounterStatus === FINISHED_ENCOUNTER_STATUS || visit.encounterStatus === CANCELLED_ENCOUNTER_STATUS) {
      return visit.visitCode;
    }
    return this.deriveCode(visit.subject, birthAt, visit.encounterStartedAt);
  }

  private deriveCode(
    subject: PostnatalVisitRecord['subject'],
    birthAt: Date,
    visitedAt: Date,
  ): PostnatalVisitCodeValue | null {
    return resolvePostnatalVisitCode({
      birthAt,
      visitedAt,
      subject,
      timeZone: this.clinicTimeZone,
    });
  }

  private toExaminationValues(
    payload: UpsertPostnatalExaminationInput,
  ): Partial<PostnatalExaminationRecord> {
    const { vitaminAGivenAt, ...rest } = payload;
    const values: Partial<PostnatalExaminationRecord> = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    return vitaminAGivenAt === undefined
      ? values
      : { ...values, vitaminAGivenAt: vitaminAGivenAt === null ? null : new Date(vitaminAGivenAt) };
  }

  private toExaminationView(examination: PostnatalExaminationRecord): PostnatalExaminationView {
    return {
      ...examination,
      vitaminAGivenAt:
        examination.vitaminAGivenAt === null ? null : examination.vitaminAGivenAt.toISOString(),
    };
  }

  private async requireBirth(pregnancyEpisodeId: string): Promise<PostnatalBirthRecord> {
    const birth = await this.postnatalVisitRepository.findBirthByPregnancyEpisodeId(
      pregnancyEpisodeId,
    );
    if (birth === null) {
      throw new UnprocessableEntityException({
        code: 'POSTNATAL_BIRTH_NOT_FOUND',
        message: 'No birth is recorded for this pregnancy episode',
      });
    }
    return birth;
  }

  private async findEncounterOrThrow(encounterId: string): Promise<EncounterWithRelationsRecord> {
    const encounter = await this.encounterAccessService.findEncounterForAccess(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    return encounter;
  }

  private async findWritableEncounter(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<EncounterWithRelationsRecord> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.findEncounterOrThrow(encounterId);
    this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    this.encounterAccessService.assertEncounterOpen(encounter);
    return encounter;
  }

  /**
   * The same reach rule `MaternalCareService` applies to her episodes: ANY
   * scope, or under OWN the mother herself or a clinician assigned to her.
   * The schedule names the baby's visits too, but it is read from the
   * mother's record, so her reach is the one that counts.
   */
  private async assertCanReadMother(patientId: string, currentUser: CurrentUser): Promise<void> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    if (scope.hasAny) {
      return;
    }
    const patient = await this.maternalCareRepository.findPatientForEpisode(patientId);
    if (patient?.ownerUserId === currentUser.sub) {
      return;
    }
    const assignment = await this.encounterAccessService.findActiveAssignmentForCaller(
      patientId,
      currentUser,
    );
    if (assignment === null) {
      throw new ForbiddenException('You are not allowed to read this pregnancy record');
    }
  }
}
