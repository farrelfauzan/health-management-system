import type { PatientLabResultView } from '@hms/shared-types';

import {
  getPatientLabResultControllerListPatientLabResultsV1QueryKey,
  patientLabResultControllerListPatientLabResultsV1,
} from '#lib/api/generated/laboratory-results/laboratory-results';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * A patient's released laboratory values, newest first (P18-T04).
 *
 * `testCode` narrows to one test, which is the only comparison worth drawing —
 * a haemoglobin next to a blood sugar says nothing. Disabled until the caller
 * asks, so expanding one row on the results panel is what fetches its trend
 * rather than every row fetching one on render.
 */
export function usePatientLabResults(params: {
  patientId: string;
  testCode?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const query = { ...(params.testCode ? { testCode: params.testCode } : {}), ...(params.limit ? { limit: params.limit } : {}) };
  const result = useApiQuery<PatientLabResultView[]>({
    queryKey: getPatientLabResultControllerListPatientLabResultsV1QueryKey(
      params.patientId,
      query,
    ),
    queryFn: (signal) =>
      patientLabResultControllerListPatientLabResultsV1(params.patientId, query, signal),
    errorMessage: 'Unable to load the laboratory history.',
    enabled: params.enabled ?? true,
  });

  return { ...result, labResults: result.data ?? [] };
}
