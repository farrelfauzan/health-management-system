import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MATERNAL_CARE_EXAMPLES } from '../../../common/openapi/maternal-care-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { RecordDeliveryDto } from '../dto/record-delivery.dto';
import { RecordNewbornCareDto } from '../dto/record-newborn-care.dto';
import { UpdateDeliveryDto } from '../dto/update-delivery.dto';
import { UpdateNewbornCareDto } from '../dto/update-newborn-care.dto';
import { DeliveryRecordService } from '../service/delivery-record.service';

/**
 * The birth (P25-T09). Authorised on the `Encounter` subject, like the episode
 * it ends and the examinations that led to it.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1' })
export class DeliveryRecordController {
  constructor(private readonly deliveryRecordService: DeliveryRecordService) {}

  @Get('pregnancy-episodes/:pregnancyEpisodeId/delivery')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'delivery-record', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: "Read this pregnancy's birth record",
    responseDescription:
      'The recorded birth with its babies, or null when nothing has been recorded yet.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.delivery },
  })
  async getDelivery(
    @Param('pregnancyEpisodeId', new ParseUUIDPipe()) pregnancyEpisodeId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.getDelivery(
        pregnancyEpisodeId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Post('pregnancy-episodes/:pregnancyEpisodeId/delivery')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Record the birth',
    responseDescription:
      'Records the birth and ends the pregnancy as DELIVERED in the same transaction, with `endedAt` the last baby\'s birth. 422 MIDWIFE_DELIVERY_MODE_OUT_OF_AUTHORITY when a midwife is named for anything but a spontaneous vaginal birth; 422 DELIVERY_REFERRAL_REQUIRED for a grade 3 or 4 tear with no referral.',
    requestType: RecordDeliveryDto,
    requestExample: MATERNAL_CARE_EXAMPLES.recordDeliveryRequest,
    responseExample: { data: MATERNAL_CARE_EXAMPLES.delivery, message: 'Delivery recorded' },
    notFoundDescription: 'Pregnancy episode not found.',
  })
  async recordDelivery(
    @Param('pregnancyEpisodeId', new ParseUUIDPipe()) pregnancyEpisodeId: string,
    @Body() payload: RecordDeliveryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.recordDelivery(
        pregnancyEpisodeId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Delivery recorded',
    };
  }

  @Patch('deliveries/:deliveryRecordId')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Correct a recorded birth',
    responseDescription:
      "Corrects the record. Changing `birthAt` moves the pregnancy's `endedAt` with it, because the episode ended when the last baby was born.",
    requestType: UpdateDeliveryDto,
    requestExample: { bloodLossMl: 350 },
    responseExample: { data: MATERNAL_CARE_EXAMPLES.delivery, message: 'Delivery updated' },
    notFoundDescription: 'Delivery record not found.',
  })
  async updateDelivery(
    @Param('deliveryRecordId', new ParseUUIDPipe()) deliveryRecordId: string,
    @Body() payload: UpdateDeliveryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.updateDelivery(
        deliveryRecordId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Delivery updated',
    };
  }

  @Post('deliveries/:deliveryRecordId/newborns')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Record a baby of this birth',
    responseDescription:
      "One row per baby. A live baby's birth order lives on her patient record (P24-T10); a stillbirth carries `stillbirthOrder` here instead.",
    requestType: RecordNewbornCareDto,
    requestExample: MATERNAL_CARE_EXAMPLES.recordNewbornRequest,
    responseExample: { data: MATERNAL_CARE_EXAMPLES.newborn, message: 'Newborn recorded' },
    notFoundDescription: 'Delivery record not found.',
  })
  async recordNewborn(
    @Param('deliveryRecordId', new ParseUUIDPipe()) deliveryRecordId: string,
    @Body() payload: RecordNewbornCareDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.recordNewborn(
        deliveryRecordId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Newborn recorded',
    };
  }

  @Patch('newborn-care-records/:newbornCareRecordId')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: "Correct a baby's essentials",
    responseDescription:
      'Corrects the first-hour checklist — the times, the APGAR scores, the measurements — and links her patient record once she is registered.',
    requestType: UpdateNewbornCareDto,
    requestExample: { apgar5Min: 9 },
    responseExample: { data: MATERNAL_CARE_EXAMPLES.newborn, message: 'Newborn updated' },
    notFoundDescription: 'Newborn care record not found.',
  })
  async updateNewborn(
    @Param('newbornCareRecordId', new ParseUUIDPipe()) newbornCareRecordId: string,
    @Body() payload: UpdateNewbornCareDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.updateNewborn(
        newbornCareRecordId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Newborn updated',
    };
  }

  @Post('newborn-care-records/:newbornCareRecordId/birth-certificate')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Issue the surat keterangan lahir',
    responseDescription:
      'Rendered from the birth and filed on the **baby**, under the BIRTH_CERTIFICATE category. 422 BIRTH_CERTIFICATE_LIVE_BIRTH_ONLY for a stillbirth, which needs a surat keterangan kematian instead; 422 NEWBORN_NOT_REGISTERED until she has a patient record to file it on.',
    responseExample: {
      data: { ...MATERNAL_CARE_EXAMPLES.document, kind: 'BIRTH_CERTIFICATE' },
      message: 'Birth certificate issued',
    },
    notFoundDescription: 'Newborn care record not found.',
  })
  async issueBirthCertificate(
    @Param('newbornCareRecordId', new ParseUUIDPipe()) newbornCareRecordId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.deliveryRecordService.issueBirthCertificate(
        newbornCareRecordId,
        this.requireUser(currentUser),
      ),
      message: 'Birth certificate issued',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
