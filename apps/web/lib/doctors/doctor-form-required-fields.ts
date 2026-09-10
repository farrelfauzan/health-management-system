import { createDoctorSchema } from '@hms/shared-types';

import { listRequiredFields } from '#lib/forms/list-required-fields';

/**
 * Field names the doctor create form marks as required, derived from the
 * schema the API validates the payload with so the two can never disagree.
 */
export const DOCTOR_FORM_REQUIRED_FIELDS: ReadonlySet<string> =
  listRequiredFields(createDoctorSchema);
