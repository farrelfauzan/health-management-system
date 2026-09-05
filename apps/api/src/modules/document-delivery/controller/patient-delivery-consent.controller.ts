import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_DELIVERY_EXAMPLES } from '../../../common/openapi/document-delivery-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { UpsertPatientDeliveryConsentDto } from '../dto/upsert-patient-delivery-consent.dto';
import { PatientDeliveryConsentService } from '../service/patient-delivery-consent.service';

/**
 * Per-patient, per-channel delivery consent (`P16-T24`, FR-E4-04).
 *
 * Under the patient's own permission keys rather than a new one: capturing
 * consent is part of completing a patient record at the counter, and the
 * people who may edit the record are the people who may ask the question.
 */
@ApiTags('Patient Delivery Consent')
@Controller({
  version: '1',
  path: 'patients/:patientId/delivery-consents',
})
export class PatientDeliveryConsentController {
  constructor(private readonly consentService: PatientDeliveryConsentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
  @Audited({
    resource: 'patient-delivery-consent',
    action: AuditAction.READ,
    idParam: null,
    patientIdParam: 'patientId',
  })
  @ApiEndpoint({
    summary: "Read a patient's delivery consent and channel readiness",
    responseDescription:
      'One entry per channel: the consent row (or null when never asked), whether a document could be delivered right now, and if not, the reason the send dialog should show. `NUMBER_*` reasons come from the verified-number gate; `CONSENT_*` from this table; `EMAIL_MISSING` from the patient record.',
    responseExample: { data: DOCUMENT_DELIVERY_EXAMPLES.consents },
    notFoundDescription: 'The patient does not exist or is outside your scope.',
  })
  async listConsents(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.consentService.listConsents(patientId, actor) };
  }

  @Put()
  @Auth([{ action: 'update', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Capture or withdraw delivery consent for one channel',
    responseDescription:
      'The full per-channel state after the change. Capturing records the privacy-notice version in force and the acting user; withdrawing records the time with reason `STAFF`. Both are audited.',
    responseExample: {
      data: DOCUMENT_DELIVERY_EXAMPLES.consents,
      message: 'Delivery consent updated',
    },
    requestType: UpsertPatientDeliveryConsentDto,
    requestExample: DOCUMENT_DELIVERY_EXAMPLES.upsertRequest,
    notFoundDescription: 'The patient does not exist or is outside your scope.',
  })
  async upsertConsent(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() payload: UpsertPatientDeliveryConsentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.consentService.upsertConsent(patientId, payload, actor);
    return { data, message: 'Delivery consent updated' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
