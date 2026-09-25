import {
  AntenatalExaminationResponse,
  buildTenTChecklist,
  ClinicalDocumentSignerRecord,
  computeGestationalAge,
  DismissAntenatalReferralInput,
  IssueAntenatalReferralLetterInput,
  MaternalDocumentResponse,
  PregnancyEpisodeRecord,
  PregnancyEpisodeVisitRow,
  resolveTriggeredReferralRules,
  TriggeredAntenatalReferralRule,
  UpsertAntenatalExaminationInput,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { ClinicalRequestDocumentService } from '../../clinical-request-document/service/clinical-request-document.service';
import { DoctorOwnProfileService } from '../../doctor-management/service/doctor-own-profile.service';
import { EncounterAccessService } from '../../emr/service/encounter-access.service';
import { MaternalCareRepository } from '../repository/maternal-care.repository';
import { toDateOnly } from '../to-date-only';
import { toMaternalDate } from '../to-maternal-date';
import { buildMaternalLetterValues } from './build-maternal-letter-values';

const AUDIT_RESOURCE = 'AntenatalVisit';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

/**
 * The integrated 10T examination of an antenatal visit, the sourced referral
 * prompts it sets off, and the two letters a midwife issues from it
 * (P25-T07, FR-ANC-03 / FR-ANC-04 / FR-ANC-06).
 *
 * It writes only what has nowhere else to live. Weight, height and blood
 * pressure stay in the encounter's vitals, the TT dose stays an
 * `Immunization`, the iron stays a `Prescription` — the checklist reads them
 * rather than asking the midwife to enter them twice, because two copies of a
 * blood pressure are two readings that can disagree.
 */
@Injectable()
export class AntenatalExaminationService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly maternalCareRepository: MaternalCareRepository,
    private readonly encounterAccessService: EncounterAccessService,
    private readonly clinicalRequestDocumentService: ClinicalRequestDocumentService,
    private readonly auditService: AuditService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly doctorOwnProfileService: DoctorOwnProfileService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async getExamination(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<AntenatalExaminationResponse> {
    const { visit, episode } = await this.resolveVisitOrThrow(encounterId, currentUser, 'read');
    return this.buildResponse({ encounterId, visit, episode });
  }

  async upsertExamination(
    encounterId: string,
    payload: UpsertAntenatalExaminationInput,
    currentUser: CurrentUser,
  ): Promise<AntenatalExaminationResponse> {
    const { visit, episode } = await this.resolveVisitOrThrow(encounterId, currentUser, 'write');
    await this.maternalCareRepository.upsertExamination({
      antenatalVisitId: visit.id,
      recordedById: currentUser.sub,
      ...payload,
      counsellingTopics: payload.counsellingTopics,
      muacCm: payload.muacCm ?? null,
      fundalHeightCm: payload.fundalHeightCm ?? null,
      fetalHeartRateBpm: payload.fetalHeartRateBpm ?? null,
      fetalPresentation: payload.fetalPresentation ?? null,
      fetalHeadEngagement: payload.fetalHeadEngagement ?? null,
      fetalCount: payload.fetalCount ?? null,
      estimatedFetalWeightGrams: payload.estimatedFetalWeightGrams ?? null,
      tetanusStatus: payload.tetanusStatus ?? null,
      ironTabletsGiven: payload.ironTabletsGiven ?? null,
      caseManagementNotes: payload.caseManagementNotes ?? null,
    });

    return this.buildResponse({ encounterId, visit, episode });
  }

  /**
   * Sets a referral prompt aside with a reason. Nothing was blocked by it, so
   * this row is the only evidence the midwife saw the finding and judged
   * otherwise — which is why the reason is required and the dismissal audited.
   */
  async dismissReferralRule(
    encounterId: string,
    payload: DismissAntenatalReferralInput,
    currentUser: CurrentUser,
  ): Promise<AntenatalExaminationResponse> {
    const { visit, episode } = await this.resolveVisitOrThrow(encounterId, currentUser, 'write');
    await this.maternalCareRepository.recordReferralDismissal({
      antenatalVisitId: visit.id,
      ruleCode: payload.ruleCode,
      reason: payload.reason,
      dismissedById: currentUser.sub,
    });
    await this.auditService.record({
      action: 'ANTENATAL_REFERRAL_DISMISSED',
      resource: AUDIT_RESOURCE,
      resourceId: visit.id,
      actorUserId: currentUser.sub,
      patientId: episode.patientId,
      metadata: { ruleCode: payload.ruleCode },
    });

    return this.buildResponse({ encounterId, visit, episode });
  }

  /**
   * Issues the surat rujukan for this visit. Each issue is a **new** document
   * and the previous one is kept: a letter the patient already carried to a
   * hospital is a record of what was said that day, not a draft.
   */
  async issueReferralLetter(
    encounterId: string,
    payload: IssueAntenatalReferralLetterInput,
    currentUser: CurrentUser,
  ): Promise<MaternalDocumentResponse> {
    const { visit, episode } = await this.resolveVisitOrThrow(encounterId, currentUser, 'write');
    const triggeredRules = await this.resolveTriggeredRules({ encounterId, visit, episode });
    const examination = await this.maternalCareRepository.findExaminationByVisitId(visit.id);
    const vitals = await this.maternalCareRepository.findLatestVitalsForRules(encounterId);
    const patient = await this.maternalCareRepository.findLetterPatient(episode.patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    const filed = await this.clinicalRequestDocumentService.renderAndFile(
      {
        kind: 'REFERRAL_LETTER',
        subjectId: visit.id,
        patientId: episode.patientId,
        encounterId,
        title: `Surat Rujukan — ${patient.fullName}`,
        values: buildMaternalLetterValues({
          patient,
          episode,
          asOf: visit.startedAt,
          examination,
          vitals,
          triggeredRules,
          letterhead: await this.clinicProfileService.getDocumentLetterhead(),
          signer: await this.resolveLetterSigner(currentUser, encounterId),
          timeZone: this.clinicTimeZone,
          destination: payload.destination,
          notes: payload.notes,
        }),
        lines: [],
      },
      currentUser.sub,
    );

    return {
      documentId: filed.documentId,
      kind: 'REFERRAL_LETTER',
      title: filed.title,
      renderedAt: filed.renderedAt,
    };
  }

  /** The surat keterangan hamil, issued from the episode rather than a visit. */
  async issuePregnancyCertificate(
    pregnancyEpisodeId: string,
    currentUser: CurrentUser,
  ): Promise<MaternalDocumentResponse> {
    await this.encounterAccessService.resolveScopeOrThrow(currentUser, 'write');
    const episode = await this.maternalCareRepository.findEpisodeById(pregnancyEpisodeId);
    if (episode === null) {
      throw new NotFoundException('Pregnancy episode not found');
    }
    const patient = await this.maternalCareRepository.findLetterPatient(episode.patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    const filed = await this.clinicalRequestDocumentService.renderAndFile(
      {
        kind: 'PREGNANCY_CERTIFICATE',
        subjectId: episode.id,
        patientId: episode.patientId,
        // Filed on the patient, not on a visit: what it attests is the
        // pregnancy, and it is issued between visits as often as during one.
        encounterId: null,
        title: `Surat Keterangan Hamil — ${patient.fullName}`,
        values: buildMaternalLetterValues({
          patient,
          episode,
          asOf: new Date(),
          examination: null,
          vitals: { systolicBloodPressure: null, diastolicBloodPressure: null },
          triggeredRules: [],
          letterhead: await this.clinicProfileService.getDocumentLetterhead(),
          signer: await this.resolveLetterSigner(currentUser, null),
          timeZone: this.clinicTimeZone,
        }),
        lines: [],
      },
      currentUser.sub,
    );

    return {
      documentId: filed.documentId,
      kind: 'PREGNANCY_CERTIFICATE',
      title: filed.title,
      renderedAt: filed.renderedAt,
    };
  }

  /**
   * Who signs a maternal letter: the clinician issuing it, from their own
   * profile — a midwife signs as *bidan* under her SIPB, a doctor under a SIP.
   * An issuer with no clinician profile falls back to the clinician the visit
   * was booked with; with neither, the block prints dashes rather than a name
   * the record does not hold.
   */
  private async resolveLetterSigner(
    currentUser: CurrentUser,
    encounterId: string | null,
  ): Promise<ClinicalDocumentSignerRecord | null> {
    const ownProfileId = await this.doctorOwnProfileService
      .resolveOwnDoctorProfileId(currentUser.sub)
      .catch((caughtError: unknown) => {
        if (caughtError instanceof NotFoundException) {
          return null;
        }
        throw caughtError;
      });
    const signerId =
      ownProfileId ??
      (encounterId === null
        ? null
        : await this.maternalCareRepository.findEncounterClinicianId(encounterId));
    return signerId === null ? null : this.maternalCareRepository.findLetterSigner(signerId);
  }

  private async buildResponse(params: {
    encounterId: string;
    visit: PregnancyEpisodeVisitRow;
    episode: PregnancyEpisodeRecord;
  }): Promise<AntenatalExaminationResponse> {
    const examination = await this.maternalCareRepository.findExaminationByVisitId(
      params.visit.id,
    );
    const sources = await this.maternalCareRepository.findChecklistSources(params.encounterId);

    return {
      examination:
        examination === null
          ? null
          : {
              muacCm: examination.muacCm,
              fundalHeightCm: examination.fundalHeightCm,
              fetalHeartRateBpm: examination.fetalHeartRateBpm,
              fetalPresentation: examination.fetalPresentation,
              fetalHeadEngagement: examination.fetalHeadEngagement,
              fetalCount: examination.fetalCount,
              estimatedFetalWeightGrams: examination.estimatedFetalWeightGrams,
              tetanusStatus: examination.tetanusStatus,
              ironTabletsGiven: examination.ironTabletsGiven,
              counsellingTopics: examination.counsellingTopics,
              caseManagementNotes: examination.caseManagementNotes,
            },
      checklist: buildTenTChecklist({ examination, sources }),
      referralRules: await this.resolveTriggeredRules(params),
    };
  }

  private async resolveTriggeredRules(params: {
    encounterId: string;
    visit: PregnancyEpisodeVisitRow;
    episode: PregnancyEpisodeRecord;
  }): Promise<TriggeredAntenatalReferralRule[]> {
    const examination = await this.maternalCareRepository.findExaminationByVisitId(
      params.visit.id,
    );
    const vitals = await this.maternalCareRepository.findLatestVitalsForRules(params.encounterId);
    const dismissedReasonsByRuleCode = await this.maternalCareRepository.listReferralDismissals(
      params.visit.id,
    );

    return resolveTriggeredReferralRules({
      input: {
        gestationalAge: computeGestationalAge({
          lastMenstrualPeriodDate: params.episode.lastMenstrualPeriodDate,
          estimatedDeliveryDate: params.episode.estimatedDeliveryDate,
          asOf: toMaternalDate(toDateOnly(params.visit.startedAt)) as Date,
        }),
        systolicBloodPressure: vitals.systolicBloodPressure,
        diastolicBloodPressure: vitals.diastolicBloodPressure,
        muacCm: examination?.muacCm ?? null,
        // Not read yet: a released haemoglobin lives behind the laboratory
        // module's own access rules, and no rule needs it while the rule list
        // is empty. The field exists so the rule that wants it has somewhere
        // to read from rather than a new shape to invent.
        haemoglobinGramsPerDecilitre: null,
        fetalHeartRateBpm: examination?.fetalHeartRateBpm ?? null,
        fetalPresentation: examination?.fetalPresentation ?? null,
      },
      dismissedReasonsByRuleCode,
    });
  }

  /**
   * The visit, its episode, and the access check for both. 409 rather than 404
   * when the encounter exists but is not an antenatal visit: the midwife's next
   * move is to mark it as one, not to go looking for a different encounter.
   */
  private async resolveVisitOrThrow(
    encounterId: string,
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<{ visit: PregnancyEpisodeVisitRow; episode: PregnancyEpisodeRecord }> {
    const scope = await this.encounterAccessService.resolveScopeOrThrow(currentUser, action);
    const encounter = await this.encounterAccessService.findEncounterForAccess(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    if (action === 'write') {
      this.encounterAccessService.assertCanWriteEncounter({ encounter, scope, currentUser });
    } else {
      await this.encounterAccessService.assertCanReadEncounter({ encounter, scope, currentUser });
    }
    const visit = await this.maternalCareRepository.findVisitByEncounterId(encounterId);
    if (visit === null || visit.pregnancyEpisodeId === undefined) {
      throw new ConflictException({
        code: 'ANTENATAL_VISIT_REQUIRED',
        message: 'This encounter is not counted as an antenatal visit',
      });
    }
    const episode = await this.maternalCareRepository.findEpisodeById(visit.pregnancyEpisodeId);
    if (episode === null) {
      throw new NotFoundException('Pregnancy episode not found');
    }

    return { visit, episode };
  }
}
