import {
  ActivePregnancyEpisodeResponse,
  AntenatalVisitResponse,
  buildTrimesterSchedule,
  computeEstimatedDeliveryDate,
  computeGestationalAge,
  CreatePregnancyEpisodeInput,
  EncounterAntenatalVisitResponse,
  EndPregnancyEpisodeInput,
  ExternalDoctorVisitResponse,
  numberAntenatalVisits,
  PregnancyEpisodeRecord,
  PregnancyEpisodeResponse,
  PregnancyEpisodeVisitRow,
  RecordExternalDoctorVisitInput,
  resolveDoctorVisitRequirements,
  resolveTrimester,
  UpdatePregnancyEpisodeInput,
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
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { PregnancyEpisodeConflictError } from '../repository/pregnancy-episode-conflict.error';
import { toDateOnly } from '../to-date-only';
import { toMaternalDate } from '../to-maternal-date';
import { PostnatalVisitService } from './postnatal-visit.service';

const AUDIT_RESOURCE = 'PregnancyEpisode';
/**
 * SATUSEHAT's ANC playbook closes an episode at HPHT + 308 days (44 weeks)
 * when contact is lost, which is the default this route applies.
 */
const LOST_TO_FOLLOW_UP_DAYS = 308;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/**
 * The pregnancy episode a midwife's antenatal work is organised around
 * (P25-T06, FR-ANC-01 / FR-ANC-02 / FR-ANC-07).
 *
 * Access is the **encounter's**, not a new rule of its own: an episode is a
 * view over the encounters that make it up, so `Encounter` `read`/`write` and
 * `EncounterAccessService` decide who may see it. That way DOCTOR, MIDWIFE and
 * ADMIN get exactly the reach they already have to the underlying visits, and
 * no permission key is seeded.
 */
@Injectable()
export class MaternalCareService {
  constructor(
    private readonly maternalCareRepository: MaternalCareRepository,
    // Only the access service, never `EncounterService`: that one reaches back
    // here to freeze a K-code at close, and importing it from this file would
    // close a require cycle at module load. This module's dependency on EMR
    // runs one way, through the gate.
    private readonly encounterAccessService: EncounterAccessService,
    private readonly auditService: AuditService,
    private readonly postnatalVisitService: PostnatalVisitService,
  ) {}

  async createEpisode(
    patientId: string,
    payload: CreatePregnancyEpisodeInput,
    currentUser: CurrentUser,
  ): Promise<PregnancyEpisodeResponse> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const patient = await this.maternalCareRepository.findPatientForEpisode(patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.sex !== 'FEMALE') {
      throw new UnprocessableEntityException({
        code: 'PREGNANCY_EPISODE_PATIENT_NOT_FEMALE',
        message: 'Only a female patient can have a pregnancy episode',
      });
    }
    const lastMenstrualPeriodDate = toMaternalDate(payload.lastMenstrualPeriodDate);
    const episode = await this.createEpisodeRecord({
      patientId,
      payload,
      lastMenstrualPeriodDate,
      createdById: currentUser.sub,
    });
    await this.recordAudit('PREGNANCY_EPISODE_CREATED', episode.id, currentUser, {
      patientId,
      eddSource: episode.eddSource,
    });

    return this.toEpisodeResponse(episode);
  }

  async listEpisodes(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<PregnancyEpisodeResponse[]> {
    await this.assertCanReadPatientEpisodes(patientId, currentUser);
    const episodes = await this.maternalCareRepository.listEpisodesByPatientId(patientId);

    return episodes.map((episode) => this.toEpisodeResponse(episode));
  }

  /**
   * The active episode with everything the Kehamilan tab draws. Null rather
   * than 404 when she has none: "not pregnant right now" is an ordinary
   * answer, and a tab that renders an empty state should not have to read a
   * thrown error to get there.
   */
  async getActiveEpisode(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<ActivePregnancyEpisodeResponse | null> {
    await this.assertCanReadPatientEpisodes(patientId, currentUser);
    const episode = await this.maternalCareRepository.findActiveEpisodeByPatientId(patientId);
    if (episode === null) {
      return null;
    }

    return this.buildActiveEpisodeResponse(episode);
  }

  async updateEpisode(
    id: string,
    payload: UpdatePregnancyEpisodeInput,
    currentUser: CurrentUser,
  ): Promise<PregnancyEpisodeResponse> {
    const episode = await this.getWritableEpisodeOrThrow(id, currentUser);
    const updated = await this.maternalCareRepository.updateEpisode(id, {
      ...(payload.lastMenstrualPeriodDate !== undefined
        ? { lastMenstrualPeriodDate: toMaternalDate(payload.lastMenstrualPeriodDate) }
        : {}),
      ...(payload.estimatedDeliveryDate !== undefined
        ? { estimatedDeliveryDate: toMaternalDate(payload.estimatedDeliveryDate) as Date }
        : {}),
      ...(payload.eddSource !== undefined ? { eddSource: payload.eddSource } : {}),
      ...(payload.gravida !== undefined ? { gravida: payload.gravida } : {}),
      ...(payload.para !== undefined ? { para: payload.para } : {}),
      ...(payload.abortus !== undefined ? { abortus: payload.abortus } : {}),
      ...(payload.prePregnancyWeightKg !== undefined
        ? { prePregnancyWeightKg: payload.prePregnancyWeightKg ?? null }
        : {}),
      ...(payload.bloodType !== undefined ? { bloodType: payload.bloodType ?? null } : {}),
      ...(payload.rhesus !== undefined ? { rhesus: payload.rhesus ?? null } : {}),
      ...(payload.riskNotes !== undefined ? { riskNotes: payload.riskNotes ?? null } : {}),
    });
    // Field names, never values: a changed HPHT renumbers every visit and
    // moves the schedule, so the trail has to say who touched what — but the
    // clinical values live on the row itself.
    await this.recordAudit('PREGNANCY_EPISODE_UPDATED', episode.id, currentUser, {
      patientId: episode.patientId,
      changedFields: Object.keys(payload).join(','),
    });

    return this.toEpisodeResponse(updated);
  }

  /**
   * Closes an episode that did not end in a birth. `DELIVERY` is not
   * reachable here — a delivered pregnancy is closed by the delivery record
   * (P25-T09), which knows the baby.
   */
  async endEpisode(
    id: string,
    payload: EndPregnancyEpisodeInput,
    currentUser: CurrentUser,
  ): Promise<PregnancyEpisodeResponse> {
    const episode = await this.getWritableEpisodeOrThrow(id, currentUser);
    const endedAt = this.resolveEndDate(episode, payload);
    const ended = await this.maternalCareRepository.endEpisode({
      id,
      reason: payload.reason,
      endedAt,
    });
    await this.recordAudit('PREGNANCY_EPISODE_ENDED', id, currentUser, {
      patientId: episode.patientId,
      reason: payload.reason,
    });

    return this.toEpisodeResponse(ended);
  }

  /**
   * Counts an open encounter as an antenatal visit of the patient's active
   * episode. The encounter's own write gate decides who may: marking a visit
   * is writing to the record.
   */
  async linkEncounterToActiveEpisode(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<EncounterAntenatalVisitResponse> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.encounterAccessService.findEncounterForAccess(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    this.encounterAccessService.assertEncounterOpen(encounter);
    const existing = await this.maternalCareRepository.findVisitByEncounterId(encounterId);
    if (existing !== null) {
      throw new ConflictException({
        code: 'ANTENATAL_VISIT_ALREADY_LINKED',
        message: 'This encounter is already counted as an antenatal visit',
      });
    }
    const episode = await this.maternalCareRepository.findActiveEpisodeByPatientId(
      encounter.patientId,
    );
    if (episode === null) {
      throw new UnprocessableEntityException({
        code: 'PREGNANCY_EPISODE_NOT_ACTIVE',
        message: 'Patient has no active pregnancy episode to count this visit against',
      });
    }
    await this.maternalCareRepository.linkVisit({
      pregnancyEpisodeId: episode.id,
      encounterId,
    });
    await this.recordAudit('ANTENATAL_VISIT_LINKED', episode.id, currentUser, {
      patientId: episode.patientId,
      encounterId,
    });

    return this.buildEncounterVisitResponse(episode, encounterId);
  }

  /** What the encounter workspace's ANC card reads, or null when unlinked. */
  async getEncounterVisit(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<EncounterAntenatalVisitResponse | null> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    const encounter = await this.encounterAccessService.findEncounterForAccess(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    await this.encounterAccessService.assertCanReadEncounter({ encounter, scope, currentUser });
    const visit = await this.maternalCareRepository.findVisitByEncounterId(encounterId);
    if (visit === null || visit.pregnancyEpisodeId === undefined) {
      return null;
    }
    const episode = await this.maternalCareRepository.findEpisodeById(visit.pregnancyEpisodeId);
    if (episode === null) {
      return null;
    }

    return this.buildEncounterVisitResponse(episode, encounterId);
  }

  async recordExternalDoctorVisit(
    id: string,
    payload: RecordExternalDoctorVisitInput,
    currentUser: CurrentUser,
  ): Promise<ExternalDoctorVisitResponse> {
    const episode = await this.getWritableEpisodeOrThrow(id, currentUser);
    const visit = await this.maternalCareRepository.recordExternalDoctorVisit({
      pregnancyEpisodeId: episode.id,
      facilityName: payload.facilityName,
      visitedAt: toMaternalDate(payload.visitedAt) as Date,
      isUltrasoundDone: payload.isUltrasoundDone,
      recordedById: currentUser.sub,
    });

    return {
      id: visit.id,
      facilityName: visit.facilityName,
      visitedAt: toDateOnly(visit.visitedAt),
      isUltrasoundDone: visit.isUltrasoundDone,
    };
  }

  /**
   * Freezes the K-code onto a visit as its encounter closes (P25-T06). Called
   * by the EMR module through this service — never by writing to this
   * module's tables from there — so the numbering rule has exactly one home.
   *
   * Numbering is derived from the episode as it stands at close, which is why
   * the code is resolved here and not when the visit was first linked: a visit
   * backdated in between would otherwise leave the sequence wrong.
   */
  async freezeVisitCodeOnEncounterClose(encounterId: string): Promise<void> {
    // A nifas or neonatal visit freezes its KF/KN code at the same moment
    // (P25-T12). An encounter is at most one of the two kinds.
    await this.postnatalVisitService.freezeVisitCodeOnEncounterClose(encounterId);
    const visit = await this.maternalCareRepository.findVisitByEncounterId(encounterId);
    if (visit === null || visit.frozenVisitCode !== null || visit.pregnancyEpisodeId === undefined) {
      return;
    }
    const episode = await this.maternalCareRepository.findEpisodeById(visit.pregnancyEpisodeId);
    if (episode === null) {
      return;
    }
    const numbered = this.numberVisits(
      episode,
      await this.maternalCareRepository.listEpisodeVisits(episode.id),
    );
    const visitCode = numbered.find((entry) => entry.encounterId === encounterId)?.visitCode;
    if (visitCode === undefined || visitCode === null) {
      return;
    }
    await this.maternalCareRepository.freezeVisitCode({ encounterId, visitCode });
  }

  private async createEpisodeRecord(params: {
    patientId: string;
    payload: CreatePregnancyEpisodeInput;
    lastMenstrualPeriodDate: Date | null;
    createdById: string;
  }): Promise<PregnancyEpisodeRecord> {
    const { payload, lastMenstrualPeriodDate } = params;
    // Naegele when the HPHT is known and nobody overrode it; otherwise the
    // date the clinician gave, with the source they gave it under. The schema
    // has already refused a payload with neither.
    const estimatedDeliveryDate =
      payload.estimatedDeliveryDate === undefined
        ? computeEstimatedDeliveryDate(lastMenstrualPeriodDate as Date)
        : (toMaternalDate(payload.estimatedDeliveryDate) as Date);
    try {
      return await this.maternalCareRepository.createEpisode({
        patientId: params.patientId,
        lastMenstrualPeriodDate,
        estimatedDeliveryDate,
        eddSource: payload.eddSource ?? 'LMP',
        gravida: payload.gravida,
        para: payload.para,
        abortus: payload.abortus,
        prePregnancyWeightKg: payload.prePregnancyWeightKg ?? null,
        bloodType: payload.bloodType ?? null,
        rhesus: payload.rhesus ?? null,
        riskNotes: payload.riskNotes ?? null,
        createdById: params.createdById,
      });
    } catch (caughtError) {
      if (caughtError instanceof PregnancyEpisodeConflictError) {
        throw new ConflictException({
          code: 'PREGNANCY_EPISODE_ALREADY_ACTIVE',
          message: caughtError.message,
        });
      }
      throw caughtError;
    }
  }

  private async buildActiveEpisodeResponse(
    episode: PregnancyEpisodeRecord,
  ): Promise<ActivePregnancyEpisodeResponse> {
    const visitRows = await this.maternalCareRepository.listEpisodeVisits(episode.id);
    const externalVisits = await this.maternalCareRepository.listExternalDoctorVisits(episode.id);
    const numbered = this.numberVisits(episode, visitRows);
    const currentGestationalAge = this.gestationalAgeAt(episode, new Date());
    const doctorVisits = resolveDoctorVisitRequirements({
      lastMenstrualPeriodDate: episode.lastMenstrualPeriodDate,
      estimatedDeliveryDate: episode.estimatedDeliveryDate,
      inHouseDoctorVisitDates: visitRows
        .filter((visit) => visit.isAttendedByDoctor && visit.encounterStatus === 'FINISHED')
        .map((visit) => visit.startedAt),
      externalDoctorVisits: externalVisits,
    });

    return {
      episode: this.toEpisodeResponse(episode),
      gestationalAge: currentGestationalAge,
      currentTrimester: resolveTrimester(currentGestationalAge),
      visits: numbered.map((entry) => this.toVisitResponse(entry, episode, visitRows)),
      externalDoctorVisits: externalVisits.map((visit) => ({
        id: visit.id,
        facilityName: visit.facilityName,
        visitedAt: toDateOnly(visit.visitedAt),
        isUltrasoundDone: visit.isUltrasoundDone,
      })),
      schedule: buildTrimesterSchedule({
        visits: numbered,
        currentGestationalAge,
        doctorVisits,
      }),
    };
  }

  private async buildEncounterVisitResponse(
    episode: PregnancyEpisodeRecord,
    encounterId: string,
  ): Promise<EncounterAntenatalVisitResponse> {
    const visitRows = await this.maternalCareRepository.listEpisodeVisits(episode.id);
    const numbered = this.numberVisits(episode, visitRows);
    const entry = numbered.find((visit) => visit.encounterId === encounterId);
    const startedAt = visitRows.find((visit) => visit.encounterId === encounterId)?.startedAt;

    return {
      encounterId,
      pregnancyEpisodeId: episode.id,
      ordinal: entry?.ordinal ?? numbered.length + 1,
      visitCode: entry?.visitCode ?? null,
      gestationalAge: this.gestationalAgeAt(episode, startedAt ?? new Date()),
    };
  }

  private numberVisits(episode: PregnancyEpisodeRecord, visitRows: PregnancyEpisodeVisitRow[]) {
    return numberAntenatalVisits({
      visits: visitRows.map((visit) => ({
        encounterId: visit.encounterId,
        startedAt: visit.startedAt,
        isCancelled: visit.encounterStatus === 'CANCELLED',
        frozenVisitCode: visit.frozenVisitCode,
      })),
      lastMenstrualPeriodDate: episode.lastMenstrualPeriodDate,
      estimatedDeliveryDate: episode.estimatedDeliveryDate,
    });
  }

  private toVisitResponse(
    entry: { encounterId: string; ordinal: number; visitCode: string | null; trimester: number | null },
    episode: PregnancyEpisodeRecord,
    visitRows: PregnancyEpisodeVisitRow[],
  ): AntenatalVisitResponse {
    const row = visitRows.find((visit) => visit.encounterId === entry.encounterId);

    return {
      id: row?.id ?? entry.encounterId,
      encounterId: entry.encounterId,
      startedAt: (row?.startedAt ?? new Date()).toISOString(),
      encounterStatus: row?.encounterStatus ?? 'IN_PROGRESS',
      ordinal: entry.ordinal,
      visitCode: entry.visitCode as AntenatalVisitResponse['visitCode'],
      trimester: entry.trimester as AntenatalVisitResponse['trimester'],
      gestationalAge: this.gestationalAgeAt(episode, row?.startedAt ?? new Date()),
    };
  }

  /**
   * `G2P1A0` is written and read as one token at the counter, so it is built
   * once here rather than in every client that shows a pregnancy header.
   */
  private toEpisodeResponse(episode: PregnancyEpisodeRecord): PregnancyEpisodeResponse {
    return {
      id: episode.id,
      patientId: episode.patientId,
      status: episode.status,
      lastMenstrualPeriodDate:
        episode.lastMenstrualPeriodDate === null
          ? null
          : toDateOnly(episode.lastMenstrualPeriodDate),
      estimatedDeliveryDate: toDateOnly(episode.estimatedDeliveryDate),
      eddSource: episode.eddSource,
      gravida: episode.gravida,
      para: episode.para,
      abortus: episode.abortus,
      gpaLabel: `G${episode.gravida}P${episode.para}A${episode.abortus}`,
      prePregnancyWeightKg: episode.prePregnancyWeightKg,
      bloodType: episode.bloodType,
      rhesus: episode.rhesus,
      riskNotes: episode.riskNotes,
      endedAt: episode.endedAt === null ? null : episode.endedAt.toISOString(),
      endReason: episode.endReason,
      createdAt: episode.createdAt.toISOString(),
    };
  }

  private gestationalAgeAt(episode: PregnancyEpisodeRecord, asOf: Date) {
    return computeGestationalAge({
      lastMenstrualPeriodDate: episode.lastMenstrualPeriodDate,
      estimatedDeliveryDate: episode.estimatedDeliveryDate,
      asOf: toMaternalDate(toDateOnly(asOf)) as Date,
    });
  }

  private resolveEndDate(
    episode: PregnancyEpisodeRecord,
    payload: EndPregnancyEpisodeInput,
  ): Date {
    if (payload.endedAt !== undefined) {
      return toMaternalDate(payload.endedAt) as Date;
    }
    if (payload.reason === 'LOST_TO_FOLLOW_UP' && episode.lastMenstrualPeriodDate !== null) {
      return new Date(
        episode.lastMenstrualPeriodDate.getTime() +
          LOST_TO_FOLLOW_UP_DAYS * ONE_DAY_IN_MILLISECONDS,
      );
    }
    return new Date();
  }

  private async getWritableEpisodeOrThrow(
    id: string,
    currentUser: CurrentUser,
  ): Promise<PregnancyEpisodeRecord> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const episode = await this.maternalCareRepository.findEpisodeById(id);
    if (episode === null) {
      throw new NotFoundException('Pregnancy episode not found');
    }
    if (episode.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'PREGNANCY_EPISODE_NOT_ACTIVE',
        message: `Pregnancy episode in status ${episode.status} can no longer be modified`,
      });
    }
    return episode;
  }

  private async assertCanReadPatientEpisodes(
    patientId: string,
    currentUser: CurrentUser,
  ): Promise<void> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'read');
    if (scope.hasAny) {
      return;
    }
    // Under OWN scope, reach is exactly the reach to her encounters: the
    // patient herself, or a clinician with an active assignment to her. A
    // midwife who may not open this patient's visits may not read the episode
    // they roll up into either.
    const patient = await this.maternalCareRepository.findPatientForEpisode(patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.ownerUserId === currentUser.sub) {
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

  private async recordAudit(
    action: 'PREGNANCY_EPISODE_CREATED' | 'PREGNANCY_EPISODE_UPDATED' | 'PREGNANCY_EPISODE_ENDED' | 'ANTENATAL_VISIT_LINKED',
    resourceId: string,
    currentUser: CurrentUser,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: AUDIT_RESOURCE,
      resourceId,
      actorUserId: currentUser.sub,
      metadata,
    });
  }
}
