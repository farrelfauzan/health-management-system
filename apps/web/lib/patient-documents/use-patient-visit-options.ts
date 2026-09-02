import type { AdmissionResponse, EncounterListItem } from '@hms/shared-types';

import {
  admissionFlowControllerListAdmissionsV1,
  getAdmissionFlowControllerListAdmissionsV1QueryKey,
} from '#lib/api/generated/admission-flow/admission-flow';
import {
  encounterControllerListEncountersV1,
  getEncounterControllerListEncountersV1QueryKey,
} from '#lib/api/generated/encounters/encounters';
import type { AdmissionFlowControllerListAdmissionsV1Params } from '#lib/api/generated/model/admissionFlowControllerListAdmissionsV1Params';
import type { EncounterControllerListEncountersV1Params } from '#lib/api/generated/model/encounterControllerListEncountersV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

type PatientVisitOptionsAccess = {
  canReadEncounters: boolean;
  canReadAdmissions: boolean;
};

/** The API's page ceiling for both lists; a patient with more has a long file. */
const VISIT_OPTIONS_PAGE_LIMIT = 100;

/**
 * The visits a document can be filed under: this patient's encounters and
 * admissions, fetched only when the caller may read them.
 *
 * Both lists are gated on the frontend ability rather than fetched and
 * allowed to `403`, because a failed query here is not an error the dialog
 * should show — a clerk who cannot read encounters can still upload a
 * general document, and the select simply offers no visits to link.
 */
export function usePatientVisitOptions(
  patientId: string,
  { canReadEncounters, canReadAdmissions }: PatientVisitOptionsAccess,
) {
  const encounterParams: EncounterControllerListEncountersV1Params = {
    patientId,
    limit: VISIT_OPTIONS_PAGE_LIMIT,
  };
  const admissionParams: AdmissionFlowControllerListAdmissionsV1Params = {
    patientId,
    limit: VISIT_OPTIONS_PAGE_LIMIT,
  };
  const encountersQuery = useApiQuery<EncounterListItem[]>({
    queryKey: getEncounterControllerListEncountersV1QueryKey(encounterParams),
    queryFn: (signal) => encounterControllerListEncountersV1(encounterParams, signal),
    errorMessage: "Unable to load the patient's visits.",
    enabled: canReadEncounters && patientId.length > 0,
    options: { retry: false },
  });
  const admissionsQuery = useApiQuery<AdmissionResponse[]>({
    queryKey: getAdmissionFlowControllerListAdmissionsV1QueryKey(admissionParams),
    queryFn: (signal) => admissionFlowControllerListAdmissionsV1(admissionParams, signal),
    errorMessage: "Unable to load the patient's admissions.",
    enabled: canReadAdmissions && patientId.length > 0,
    options: { retry: false },
  });
  const isLoadingEncounters = canReadEncounters && encountersQuery.isPending;
  const isLoadingAdmissions = canReadAdmissions && admissionsQuery.isPending;
  return {
    encounters: canReadEncounters ? (encountersQuery.data ?? []) : [],
    admissions: canReadAdmissions ? (admissionsQuery.data ?? []) : [],
    isPending: isLoadingEncounters || isLoadingAdmissions,
  };
}
