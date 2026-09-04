import type { UserOffboardingPreview } from '@hms/shared-types';

import {
  getUserOffboardingControllerPreviewOffboardingV1QueryKey,
  userOffboardingControllerPreviewOffboardingV1,
} from '#lib/api/generated/admin-management/admin-management';
import { useApiQuery } from '#lib/api/use-api-query';

type UseUserOffboardingPreviewOptions = {
  userId: string;
  isEnabled: boolean;
  fallbackError: string;
};

/**
 * What offboarding a user would delete and keep (P16-T41, FR-E3-31), for the
 * confirm dialog. Never retried: a super admin looking at a stale count is
 * worse than one looking at an error, and the dialog disables confirm on
 * either.
 */
export function useUserOffboardingPreview({
  userId,
  isEnabled,
  fallbackError,
}: UseUserOffboardingPreviewOptions) {
  return useApiQuery<UserOffboardingPreview>({
    queryKey: getUserOffboardingControllerPreviewOffboardingV1QueryKey(userId),
    queryFn: (signal) => userOffboardingControllerPreviewOffboardingV1(userId, signal),
    errorMessage: fallbackError,
    enabled: isEnabled,
    options: { retry: false },
  });
}
