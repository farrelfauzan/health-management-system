import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DeliveryPasswordPatientRecord,
  DeliveryPasswordSourceValue,
  DocumentDeliveryConfig,
} from '@hms/shared-types';

import { resolveDocumentDeliveryConfig } from '../document-delivery.config';
import { formatDateOfBirthPassword } from './format-date-of-birth-password';

/**
 * Where the send dialog sends a clerk to complete the record (FR-E4-07).
 * The admin shell's patient route; the doctor shell has no edit form.
 */
const PATIENT_RECORD_PATH_PREFIX = '/admin/patients/';

export const DELIVERY_PASSWORD_SOURCE_MISSING_CODE = 'DELIVERY_PASSWORD_SOURCE_MISSING';

/**
 * Derives the attachment password for one patient from the configured
 * scheme (`P16-T37`, FR-E4-06/07).
 *
 * **The password is a return value and nothing else.** It is not logged, not
 * persisted, and not carried on any type that outlives the send: the caller
 * hands it to the encryption service and drops it, and the delivery row
 * records only `passwordSource` so a reader of the database learns how the
 * password was derived and not what it was.
 *
 * A patient with no date of birth cannot receive a DOB-locked document, and
 * the refusal names the field and where to complete it (FR-E4-07). The
 * column has been `NOT NULL` since `P17-T05`, so this is the resolver's
 * contract rather than a path anyone expects to hit — but a guard that only
 * exists while the schema forbids the case is a guard that vanishes the day
 * someone relaxes the column.
 */
@Injectable()
export class DeliveryPasswordService {
  private readonly deliveryConfig: DocumentDeliveryConfig;

  constructor(configService: ConfigService) {
    this.deliveryConfig = resolveDocumentDeliveryConfig(configService);
  }

  get passwordSource(): DeliveryPasswordSourceValue {
    return this.deliveryConfig.passwordSource;
  }

  resolvePassword(patient: DeliveryPasswordPatientRecord): string {
    const source = this.deliveryConfig.passwordSource;
    if (source === 'MRN') {
      return patient.mrn;
    }
    if (patient.dateOfBirth === null) {
      throw new UnprocessableEntityException({
        message:
          'This patient has no date of birth on file, so a password-protected document cannot be prepared. Complete the record first.',
        code: DELIVERY_PASSWORD_SOURCE_MISSING_CODE,
        errors: {
          missingField: 'dateOfBirth',
          recordPath: `${PATIENT_RECORD_PATH_PREFIX}${patient.id}`,
        },
      });
    }
    return formatDateOfBirthPassword(patient.dateOfBirth, source);
  }
}
