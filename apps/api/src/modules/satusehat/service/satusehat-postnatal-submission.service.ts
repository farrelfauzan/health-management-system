import { randomUUID } from 'node:crypto';

import { SatusehatPostnatalEpisodeFinish, SatusehatPostnatalVisit } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  SATUSEHAT_NEONATAL_VISIT_SYSTEM,
  SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE,
  SATUSEHAT_PUERPERIUM_VISIT_SYSTEM,
} from '../../../common/satusehat/satusehat-episode-of-care-coding';
import { SatusehatEpisodeOfCareClient } from '../../../common/satusehat/satusehat-episode-of-care.client';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import {
  SatusehatEncounterMapInput,
  SatusehatFhirBundleEntry,
  SatusehatPostnatalObservationMapInput,
} from '../../../common/satusehat/satusehat-fhir.types';
import { SatusehatPostnatalMapper } from '../../../common/satusehat/satusehat-postnatal.mapper';
import { resolveSatusehatConfig } from '../../../common/satusehat/satusehat.config';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatConfig } from '../../../common/satusehat/satusehat.types';
import { SatusehatPostnatalRepository } from '../repository/satusehat-postnatal.repository';

const MILLISECONDS_PER_DAY = 86_400_000;
/** The playbook closes the PNC episode 42 days after the delivery. */
const NIFAS_PERIOD_DAYS = 42;

/**
 * The PNC use case inside an encounter submission (P25-T12), kept beside
 * `SatusehatSubmissionService` so that one stays about the bundle.
 *
 * Only a mother's visit that earned a KF code opens or references the PNC
 * episode. A visit outside every window is reported as an ordinary encounter:
 * it is not a nifas visit the platform can count, and after day 42 its episode
 * may already be closed. A baby's visit that earned a KN code adds only its KN
 * identifier — the neonatal EpisodeOfCare exists on the platform (`Neonate`)
 * but when it should close was not probed, and opening episodes nothing here
 * closes would block every other clinic from opening one for that baby.
 */
@Injectable()
export class SatusehatPostnatalSubmissionService {
  private readonly logger = new Logger(SatusehatPostnatalSubmissionService.name);
  private readonly satusehatConfig: SatusehatConfig;

  constructor(
    configService: ConfigService,
    private readonly episodeOfCareClient: SatusehatEpisodeOfCareClient,
    private readonly postnatalMapper: SatusehatPostnatalMapper,
    private readonly fhirMapper: SatusehatFhirMapper,
    private readonly postnatalRepository: SatusehatPostnatalRepository,
  ) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /**
   * The visit with its PNC episode id filled in, adopting before creating —
   * the ANC order (P25-T08): our own identifier narrowed to `type=PNC` (the
   * ANC episode carries the same identifier), then the patient's open PNC
   * episode whoever opened it, and only then a POST. The id is saved before
   * the bundle goes.
   */
  async ensurePostnatalEpisode(params: {
    postnatalVisit: SatusehatPostnatalVisit | null;
    patientIhsNumber: string;
    patientName?: string;
  }): Promise<SatusehatPostnatalVisit | null> {
    const visit = params.postnatalVisit;
    if (visit === null || !this.isCountedNifasVisit(visit) || visit.satusehatPostnatalEpisodeOfCareId !== null) {
      return visit;
    }
    const adopted = await this.findExistingEpisode(visit.pregnancyEpisodeId, params.patientIhsNumber);
    const satusehatEpisodeOfCareId =
      adopted ??
      (await this.episodeOfCareClient.createEpisodeOfCare(
        this.postnatalMapper.mapPostnatalEpisodeOfCare({
          pregnancyEpisodeId: visit.pregnancyEpisodeId,
          patientIhsNumber: params.patientIhsNumber,
          ...(params.patientName ? { patientName: params.patientName } : {}),
          startedAt: visit.birthAt,
        }),
      ));
    await this.postnatalRepository.savePostnatalEpisodeOfCareId({
      pregnancyEpisodeId: visit.pregnancyEpisodeId,
      satusehatEpisodeOfCareId,
    });
    this.logger.log(
      adopted === null
        ? 'SATUSEHAT PNC episode created for this birth'
        : 'SATUSEHAT PNC episode adopted rather than created',
    );
    return { ...visit, satusehatPostnatalEpisodeOfCareId: satusehatEpisodeOfCareId };
  }

  /** What `mapEncounter` adds for this visit: the KF/KN identifier and the PNC reference. */
  buildEncounterPostnatalInput(
    visit: SatusehatPostnatalVisit | null,
  ): Pick<SatusehatEncounterMapInput, 'postnatalEpisode'> {
    if (visit === null || visit.visitCode === null) {
      return {};
    }
    const isMother = visit.subject === 'MOTHER';
    return {
      postnatalEpisode: {
        satusehatEpisodeOfCareId: isMother ? visit.satusehatPostnatalEpisodeOfCareId : null,
        visitIdentifier: {
          system: isMother ? SATUSEHAT_PUERPERIUM_VISIT_SYSTEM : SATUSEHAT_NEONATAL_VISIT_SYSTEM,
          value: visit.visitCode,
        },
      },
    };
  }

  /** The nifas Observations of a counted mother's visit, or none. */
  buildObservationEntries(params: {
    visit: SatusehatPostnatalVisit | null;
    encounterFullUrl: string;
    patientIhsNumber: string;
    patientName?: string;
    practitionerIhsNumber: string;
    recordedAt: Date;
  }): SatusehatFhirBundleEntry[] {
    const visit = params.visit;
    if (visit === null || !this.isCountedNifasVisit(visit)) {
      return [];
    }
    return this.postnatalMapper
      .mapPostnatalObservations({
        patientIhsNumber: params.patientIhsNumber,
        ...(params.patientName ? { patientName: params.patientName } : {}),
        practitionerIhsNumber: params.practitionerIhsNumber,
        encounterReference: params.encounterFullUrl,
        recordedAt: params.recordedAt,
        values: this.buildObservationValues(visit),
      })
      .map((observation) => ({
        fullUrl: `urn:uuid:${randomUUID()}`,
        resource: observation,
        request: { method: 'POST' as const, url: 'Observation' as const },
      }));
  }

  /**
   * Closes the PNC episode: `period.end` is the delivery plus 42 days, the
   * playbook's end of nifas, whenever the sweep got round to it.
   */
  async finishPostnatalEpisode(params: {
    finishData: SatusehatPostnatalEpisodeFinish & {
      satusehatPostnatalEpisodeOfCareId: string;
      birthAt: Date;
    };
    patientIhsNumber: string;
  }): Promise<void> {
    const { finishData } = params;
    await this.episodeOfCareClient.patchEpisodeOfCare(
      finishData.satusehatPostnatalEpisodeOfCareId,
      this.fhirMapper.mapAntenatalEpisodeFinishOperations({
        patientIhsNumber: params.patientIhsNumber,
        startedAt: finishData.birthAt,
        endedAt: new Date(finishData.birthAt.getTime() + NIFAS_PERIOD_DAYS * MILLISECONDS_PER_DAY),
      }),
    );
  }

  private isCountedNifasVisit(visit: SatusehatPostnatalVisit): boolean {
    return visit.subject === 'MOTHER' && visit.visitCode !== null;
  }

  private async findExistingEpisode(
    pregnancyEpisodeId: string,
    patientIhsNumber: string,
  ): Promise<string | null> {
    return (
      (await this.episodeOfCareClient.findEpisodeIdByIdentifier(
        this.requireOrganizationId(),
        pregnancyEpisodeId,
        SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE,
      )) ??
      (await this.episodeOfCareClient.findActiveEpisodeIdByPatient(
        patientIhsNumber,
        SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE,
      ))
    );
  }

  private buildObservationValues(
    visit: SatusehatPostnatalVisit,
  ): SatusehatPostnatalObservationMapInput['values'] {
    const examination = visit.examination;
    const recorded = examination === null
      ? {}
      : Object.fromEntries(
          Object.entries({
            vaginalBleeding: examination.vaginalBleeding,
            bloodLossMl: examination.bloodLossMl,
            perineumCondition: examination.perineumCondition,
            perinealInfectionSigns: examination.perinealInfectionSigns,
            caesareanWoundInfectionSigns: examination.caesareanWoundInfectionSigns,
            breastCondition: examination.breastCondition,
            uterineContraction: examination.uterineContraction,
            lochiaColour: examination.lochiaColour,
            lochiaOdour: examination.lochiaOdour,
            breastMilkProduction: examination.breastMilkProduction,
            urination: examination.urination,
            defecation: examination.defecation,
          }).filter(([, value]) => value !== null && value !== ''),
        );
    return { deliveryDate: visit.birthAt, ...recorded };
  }

  private requireOrganizationId(): string {
    const organizationId = this.satusehatConfig.organizationId;
    if (!organizationId) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT_ORGANIZATION_ID is not configured',
      );
    }
    return organizationId;
  }
}
