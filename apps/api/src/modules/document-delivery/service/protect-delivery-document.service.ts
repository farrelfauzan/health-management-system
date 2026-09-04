import { Injectable } from '@nestjs/common';

import { DeliveryPasswordPatientRecord, ProtectedDeliveryDocument } from '@hms/shared-types';

import { PdfEncryptionService } from '../../../common/pdf/pdf-encryption.service';
import { DeliveryPasswordService } from './delivery-password.service';
import { describePasswordScheme } from './describe-password-scheme';

/**
 * The step between render and transport on both channels (`P16-T37`):
 * resolve the patient's password, lock the PDF with it, hand back the bytes
 * and the scheme — never the password.
 *
 * This is what the delivery worker (`P16-T25`/`T26`) and clinical-document
 * release (`P16-T40`) call. The password exists for the duration of this
 * method and is gone when it returns; `passwordSource` is what the delivery
 * row records, so a reader of that row learns how the file was locked and
 * not how to open it.
 */
@Injectable()
export class ProtectDeliveryDocumentService {
  constructor(
    private readonly passwordService: DeliveryPasswordService,
    private readonly encryptionService: PdfEncryptionService,
  ) {}

  async protectForPatient(params: {
    pdf: Uint8Array;
    patient: DeliveryPasswordPatientRecord;
  }): Promise<ProtectedDeliveryDocument> {
    const userPassword = this.passwordService.resolvePassword(params.patient);
    const content = await this.encryptionService.encryptWithUserPassword({
      pdf: params.pdf,
      userPassword,
    });
    return { content, passwordSource: this.passwordService.passwordSource };
  }

  /**
   * The line the caption or mail body must carry (FR-E4-08): it names the
   * scheme the deployment is configured with, and contains no value.
   */
  describeScheme(): string {
    return describePasswordScheme(this.passwordService.passwordSource);
  }
}
