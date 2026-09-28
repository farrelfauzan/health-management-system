import type {
  BpjsSubmissionStatusValue,
  BpjsSubmissionTypeValue,
  SatusehatSubmissionKindValue,
} from '@hms/shared-types';

import type { SubmissionMonitorProvider } from '#lib/integrations/submission-monitor-providers';

/** The submission monitor's opening filters, as a link can set them. */
export type SubmissionMonitorFilters = {
  status: 'ALL' | BpjsSubmissionStatusValue;
  type: 'ALL' | BpjsSubmissionTypeValue;
  kind: 'ALL' | SatusehatSubmissionKindValue;
};

/** What a "Perbaiki" link on the reporting status page asks the monitor to open. */
export type SubmissionMonitorLinkTarget = {
  provider: SubmissionMonitorProvider;
  status: BpjsSubmissionStatusValue;
  type?: BpjsSubmissionTypeValue;
  kind?: SatusehatSubmissionKindValue;
};
