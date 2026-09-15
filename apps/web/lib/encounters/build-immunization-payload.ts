import {
  IMMUNIZATION_REASONS,
  type AddImmunizationInput,
  type ImmunizationReasonValue,
  type ImmunizationRouteValue,
  type ImmunizationSiteValue,
} from '@hms/shared-types';

import type { ImmunizationDraft } from '#lib/encounters/immunization-draft';
import type { ImmunizationPayloadResult } from '#lib/encounters/immunization-payload-result';
import { UNSPECIFIED_IMMUNIZATION_OPTION } from '#lib/encounters/unspecified-immunization-option';

/**
 * Turns the form into a request, or names what is missing (P24-T12).
 *
 * Mirrors the shared schema so the clinician hears it before the round trip:
 * the vaccine, the reason and the dose number are always needed — SATUSEHAT
 * refuses an Immunization without `reasonCode` or `protocolApplied` — and a
 * dose given here also needs its lot and expiry. A historical dose copied
 * from a card does not, and sends neither even if typed before the box was
 * ticked, because the platform is told it has no batch facts.
 */
export function buildImmunizationPayload(draft: ImmunizationDraft): ImmunizationPayloadResult {
  const errorKey = findMissingImmunizationField(draft);
  if (errorKey !== null) {
    return { payload: null, errorKey };
  }
  const payload: AddImmunizationInput = {
    medicationId: draft.medicationId,
    reason: draft.reason as ImmunizationReasonValue,
    isHistorical: draft.isHistorical,
    doseNumber: Number(draft.doseNumber),
    ...(draft.isHistorical
      ? {}
      : { lotNumber: draft.lotNumber.trim(), expirationDate: draft.expirationDate }),
    ...(draft.route === UNSPECIFIED_IMMUNIZATION_OPTION
      ? {}
      : { route: draft.route as ImmunizationRouteValue }),
    ...(draft.site === UNSPECIFIED_IMMUNIZATION_OPTION
      ? {}
      : { site: draft.site as ImmunizationSiteValue }),
  };
  return { payload, errorKey: null };
}

function findMissingImmunizationField(
  draft: ImmunizationDraft,
): ImmunizationPayloadResult['errorKey'] {
  if (!draft.medicationId) {
    return 'encounters.immunization.pick';
  }
  if (!(IMMUNIZATION_REASONS as readonly string[]).includes(draft.reason)) {
    return 'encounters.immunization.pickReason';
  }
  if (!draft.doseNumber) {
    return 'encounters.immunization.doseRequired';
  }
  if (!draft.isHistorical && (!draft.lotNumber.trim() || !draft.expirationDate)) {
    return 'encounters.immunization.newDoseRequired';
  }
  return null;
}
