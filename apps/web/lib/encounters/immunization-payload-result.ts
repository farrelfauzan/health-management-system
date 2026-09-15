import type { AddImmunizationInput } from '@hms/shared-types';

/**
 * Either the request to send, or the `clinical` message key naming the first
 * thing the clinician still has to fill in.
 */
export type ImmunizationPayloadResult =
  | { payload: AddImmunizationInput; errorKey: null }
  | {
      payload: null;
      errorKey:
        | 'encounters.immunization.pick'
        | 'encounters.immunization.pickReason'
        | 'encounters.immunization.doseRequired'
        | 'encounters.immunization.newDoseRequired';
    };
