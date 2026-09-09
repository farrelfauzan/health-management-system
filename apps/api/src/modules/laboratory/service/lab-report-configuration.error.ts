import {
  LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES,
  LabReportConfigurationFailureCode,
} from '@hms/shared-types';

/**
 * A render that cannot succeed until somebody changes a setting (P18-T16).
 *
 * Its own class rather than a `NotFoundException` re-thrown, because the two
 * mean opposite things to the worker: a missing *report* is a bug, a missing
 * *clinic profile* is a Tuesday. Terminal by construction — the worker parks
 * the row FAILED on the first attempt instead of spending five guaranteed
 * failures on it — and carries the code the versions list turns into a link
 * to the screen that fixes it. The message is the registry's, so the row's
 * `lastError` is recognisable as this code when it is read back.
 */
export class LabReportConfigurationError extends Error {
  constructor(readonly code: LabReportConfigurationFailureCode) {
    super(LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES[code]);
    this.name = 'LabReportConfigurationError';
  }
}
