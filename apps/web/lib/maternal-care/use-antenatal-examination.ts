import type { AntenatalExaminationResponse } from '@hms/shared-types';

import {
  antenatalExaminationControllerGetExaminationV1,
  getAntenatalExaminationControllerGetExaminationV1QueryKey,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The visit's 10T examination, its computed checklist and the referral prompts
 * it set off (P25-T07). Disabled until the encounter is counted as an
 * antenatal visit — the API answers 409 otherwise, and asking for it before
 * then would put a red toast on an ordinary screen.
 */
export function useAntenatalExamination(encounterId: string, isEnabled: boolean) {
  const query = useApiQuery<AntenatalExaminationResponse>({
    queryKey: getAntenatalExaminationControllerGetExaminationV1QueryKey(encounterId),
    queryFn: (signal) => antenatalExaminationControllerGetExaminationV1(encounterId, signal),
    errorMessage: 'Failed to load the antenatal examination',
    enabled: isEnabled && encounterId.length > 0,
  });

  return { ...query, examination: query.data ?? null };
}
