import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  buildSatusehatEpisodeOfCareIdentifierSystem,
  SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM,
  SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE,
  SATUSEHAT_POSTNATAL_EPISODE_TYPE_DISPLAY,
} from './satusehat-episode-of-care-coding';
import {
  SatusehatFhirEpisodeOfCare,
  SatusehatFhirObservation,
  SatusehatPostnatalEpisodeMapInput,
  SatusehatPostnatalObservationDefinition,
  SatusehatPostnatalObservationField,
  SatusehatPostnatalObservationMapInput,
} from './satusehat-fhir.types';
import { SATUSEHAT_POSTNATAL_OBSERVATION_DEFINITIONS } from './satusehat-postnatal-observation-definitions';
import { resolveSatusehatConfig } from './satusehat.config';
import { SatusehatError } from './satusehat.error';
import { SatusehatConfig } from './satusehat.types';

const UCUM_SYSTEM = 'http://unitsofmeasure.org';
const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const CATEGORY_DISPLAYS: Readonly<Record<SatusehatPostnatalObservationDefinition['category'], string>> = {
  survey: 'Survey',
  exam: 'Exam',
};

type ObservationValue = number | string | boolean | Date;

/**
 * The PNC use case's own resources (P25-T12): the nifas EpisodeOfCare and the
 * nifas Observations. Its own class rather than more methods on
 * `SatusehatFhirMapper`, which already maps every other resource; the Encounter
 * side (the KF identifier and the episode reference) stays there, because the
 * Encounter is one resource with one mapper.
 *
 * The close is not here: `mapAntenatalEpisodeFinishOperations` builds a list
 * that names no episode type, and the sandbox accepted it for PNC unchanged.
 */
@Injectable()
export class SatusehatPostnatalMapper {
  private readonly satusehatConfig: SatusehatConfig;

  constructor(configService: ConfigService) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /**
   * The PNC episode of one birth, opened at the first nifas visit. Identified
   * by our pregnancy row — the same value the ANC episode carries, which the
   * platform allows because the identifier is not unique across types — so a
   * timed-out create can be found again by `type=PNC` plus that identifier.
   */
  mapPostnatalEpisodeOfCare(input: SatusehatPostnatalEpisodeMapInput): SatusehatFhirEpisodeOfCare {
    const organizationId = this.requireOrganizationId();
    return {
      resourceType: 'EpisodeOfCare',
      identifier: [
        {
          system: buildSatusehatEpisodeOfCareIdentifierSystem(organizationId),
          use: 'official',
          value: input.pregnancyEpisodeId,
        },
      ],
      status: 'active',
      type: [
        {
          coding: [
            {
              system: SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM,
              code: SATUSEHAT_POSTNATAL_EPISODE_TYPE_CODE,
              display: SATUSEHAT_POSTNATAL_EPISODE_TYPE_DISPLAY,
            },
          ],
        },
      ],
      patient: {
        reference: `Patient/${input.patientIhsNumber}`,
        ...(input.patientName ? { display: input.patientName } : {}),
      },
      managingOrganization: { reference: `Organization/${organizationId}` },
      period: { start: input.startedAt.toISOString() },
    };
  }

  /** One Observation per recorded nifas finding; an unrecorded one is left out. */
  mapPostnatalObservations(input: SatusehatPostnatalObservationMapInput): SatusehatFhirObservation[] {
    return Object.entries(SATUSEHAT_POSTNATAL_OBSERVATION_DEFINITIONS).flatMap(
      ([field, definition]) => {
        const value = input.values[field as SatusehatPostnatalObservationField];
        if (value === undefined || value === null) {
          return [];
        }
        const valueElement = this.buildValue(definition, value);
        return valueElement === null ? [] : [this.buildObservation(input, definition, valueElement)];
      },
    );
  }

  private buildObservation(
    input: SatusehatPostnatalObservationMapInput,
    definition: SatusehatPostnatalObservationDefinition,
    valueElement: Partial<SatusehatFhirObservation>,
  ): SatusehatFhirObservation {
    const recordedAt = input.recordedAt.toISOString();
    return {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: OBSERVATION_CATEGORY_SYSTEM,
              code: definition.category,
              display: CATEGORY_DISPLAYS[definition.category],
            },
          ],
        },
      ],
      code: {
        coding: [{ system: definition.system, code: definition.code, display: definition.display }],
      },
      subject: {
        reference: `Patient/${input.patientIhsNumber}`,
        ...(input.patientName ? { display: input.patientName } : {}),
      },
      encounter: { reference: input.encounterReference },
      effectiveDateTime: recordedAt,
      issued: recordedAt,
      ...(input.practitionerIhsNumber
        ? { performer: [{ reference: `Practitioner/${input.practitionerIhsNumber}` }] }
        : {}),
      ...valueElement,
    };
  }

  /**
   * The value element for one finding, or null for a coded answer the table
   * does not know — sent as nothing rather than as an invented coding.
   */
  private buildValue(
    definition: SatusehatPostnatalObservationDefinition,
    value: ObservationValue,
  ): Partial<SatusehatFhirObservation> | null {
    if (value instanceof Date) {
      return { valueDateTime: value.toISOString() };
    }
    if (typeof value === 'boolean') {
      return { valueBoolean: value };
    }
    if (definition.answers) {
      const answer = definition.answers[String(value)];
      return answer ? { valueCodeableConcept: { coding: [answer], text: answer.display } } : null;
    }
    if (typeof value === 'number' && definition.unit && definition.ucumCode) {
      return {
        valueQuantity: { value, unit: definition.unit, system: UCUM_SYSTEM, code: definition.ucumCode },
      };
    }
    return { valueString: String(value) };
  }

  private requireOrganizationId(): string {
    const organizationId = this.satusehatConfig.organizationId;
    if (!organizationId) {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        'SATUSEHAT FHIR mapping requires SATUSEHAT_ORGANIZATION_ID to be configured',
      );
    }
    return organizationId;
  }
}
