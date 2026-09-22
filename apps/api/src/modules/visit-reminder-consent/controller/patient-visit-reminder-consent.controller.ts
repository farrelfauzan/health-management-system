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
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VISIT_REMINDER_EXAMPLES } from '../../../common/openapi/visit-reminder-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { UpsertVisitReminderConsentDto } from '../dto/upsert-visit-reminder-consent.dto';
import { VisitReminderConsentService } from '../service/visit-reminder-consent.service';

/**
 * A patient's consent to WhatsApp visit reminders (P25-T17, D-042).
 *
 * Under the patient's own permission keys, like delivery consent: asking is
 * part of completing the record at the desk. Gated on `maternal-care`
 * because the reminders are of maternal visits and a clinic without the
 * feature has nothing to remind about.
 */
@ApiTags('Visit Reminder Consent')
@RequireFeature('maternal-care')
@Controller({ version: '1', path: 'patients/:patientId/visit-reminder-consent' })
export class PatientVisitReminderConsentController {
  constructor(private readonly consentService: VisitReminderConsentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
  @Audited({
    resource: 'patient-visit-reminder-consent',
    action: AuditAction.READ,
    idParam: null,
    patientIdParam: 'patientId',
  })
  @ApiEndpoint({
    summary: "Read a patient's visit-reminder consent",
    responseDescription:
      '`consent` is null when she was never asked. Reminders go out only while `isGranted` is true, and only to a WhatsApp number verified for her.',
    responseExample: { data: VISIT_REMINDER_EXAMPLES.consent },
    notFoundDescription: 'The patient does not exist or is outside your scope.',
  })
  async getConsent(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.consentService.getConsent(patientId, this.assertAuthenticated(currentUser)),
    };
  }

  @Put()
  @Auth([{ action: 'update', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Capture or withdraw visit-reminder consent',
    responseDescription:
      'The consent after the change. Capturing records the privacy-notice version in force and the acting user; withdrawing records the time with reason `STAFF`. Both are audited. Document-delivery consent is not touched.',
    responseExample: {
      data: VISIT_REMINDER_EXAMPLES.consent,
      message: 'Visit reminder consent updated',
    },
    requestType: UpsertVisitReminderConsentDto,
    requestExample: VISIT_REMINDER_EXAMPLES.upsertRequest,
    notFoundDescription: 'The patient does not exist or is outside your scope.',
  })
  async upsertConsent(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() payload: UpsertVisitReminderConsentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const data = await this.consentService.upsertConsent(
      patientId,
      payload,
      this.assertAuthenticated(currentUser),
    );
    return { data, message: 'Visit reminder consent updated' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
