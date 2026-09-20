import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCTOR_MANDATE_EXAMPLES } from '../../../common/openapi/doctor-mandate-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateDoctorAuthorityUploadUrlDto } from '../dto/create-doctor-authority-upload-url.dto';
import { CreateDoctorMandateDto } from '../dto/create-doctor-mandate.dto';
import { RevokeDoctorMandateDto } from '../dto/revoke-doctor-mandate.dto';
import { DoctorMandateService } from '../service/doctor-mandate.service';

const AUDIT_RESOURCE = 'doctor-mandate';

/**
 * A doctor's written pelimpahan to a midwife (P25-T05, PP 28/2024 Pasal 745
 * and Permenkes 13/2025 Pasal 184 — Permenkes 28/2017 Pasal 27 is revoked,
 * D-036). Its own controller and its own permission pair
 * (`doctor.mandate.read/write:any`, ADMIN only), for the same reason the
 * authorities have theirs: what a midwife has been asked to do under somebody
 * else's responsibility is a compliance record, not part of the directory.
 */
@ApiTags('Doctor Mandates')
@Controller({
  version: '1',
  path: 'doctors/:doctorId/mandates',
})
export class DoctorMandateController {
  constructor(private readonly doctorMandateService: DoctorMandateService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'DoctorMandate' }])
  @ApiEndpoint({
    summary: 'List the pelimpahan a midwife works under',
    responseDescription:
      'Every recorded mandate of the midwife, live rows first, each with its status judged on the clinic’s calendar day and the doctor who granted it named. `policyWarnings` carries rules that inform rather than refuse (D-036): an overlap with another live mandate, or a delegation whose window is not the 1–3 month absence PP 28/2024 Pasal 745(3) describes.',
    responseExample: { data: [DOCTOR_MANDATE_EXAMPLES.item] },
    notFoundDescription: 'Doctor not found.',
  })
  async listMandates(@Param('doctorId', new ParseUUIDPipe()) doctorId: string) {
    return { data: await this.doctorMandateService.listMandates(doctorId) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'DoctorMandate' }])
  @Audited({ resource: AUDIT_RESOURCE, action: AuditAction.DOCTOR_MANDATE_GRANTED })
  @ApiEndpoint({
    summary: 'Record a pelimpahan',
    responseDescription:
      'Records one written mandate against a midwife. `kind` says which form it is: a `MANDATE` leaves responsibility with the doctor who supervises, a `DELEGATION` moves it to the midwife while he is away. Refused with 422 `DOCTOR_MANDATE_INVALID_PARTIES` unless the midwife is a `MIDWIFE`, the mandating profile an active `DOCTOR`, and the two different; and with 422 `DOCTOR_MANDATE_INSTRUCTION_REQUIRED` when the written instruction cannot be read back from storage. `icd9cmCodes` are the delegated procedures — at least one, because that list is what the procedure gate reads.',
    responseExample: { data: DOCTOR_MANDATE_EXAMPLES.item, message: 'Mandate recorded' },
    requestType: CreateDoctorMandateDto,
    requestExample: DOCTOR_MANDATE_EXAMPLES.createRequest,
    successStatus: 201,
    notFoundDescription: 'Doctor or mandating doctor not found.',
  })
  async createMandate(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() payload: CreateDoctorMandateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorMandateService.createMandate(
        doctorId,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Mandate recorded',
    };
  }

  @Post('upload-url')
  @Auth([{ action: 'write', subject: 'DoctorMandate' }])
  @ApiEndpoint({
    summary: 'Sign an upload of the written instruction',
    responseDescription:
      'A presigned PUT under `doctor-mandates/{doctorId}/`. Nothing is recorded until a create names the returned `storageKey`; the API then reads the object back from storage before trusting it.',
    responseExample: { data: DOCTOR_MANDATE_EXAMPLES.uploadUrl },
    requestType: CreateDoctorAuthorityUploadUrlDto,
    requestExample: DOCTOR_MANDATE_EXAMPLES.uploadUrlRequest,
    notFoundDescription: 'Doctor not found.',
  })
  async createInstructionUploadUrl(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() payload: CreateDoctorAuthorityUploadUrlDto,
  ) {
    return {
      data: await this.doctorMandateService.createInstructionUploadUrl(doctorId, payload),
    };
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DoctorMandate' }])
  @Audited({
    resource: AUDIT_RESOURCE,
    action: AuditAction.DOCTOR_MANDATE_REVOKED,
    idParam: 'id',
  })
  @ApiEndpoint({
    summary: 'Revoke a pelimpahan',
    responseDescription:
      'Ends the mandate now, recording who revoked it and why. The row stays for the audit trail, and every procedure already performed under it keeps naming it — what happened under a mandate does not stop having happened.',
    responseExample: { data: DOCTOR_MANDATE_EXAMPLES.revokedItem, message: 'Mandate revoked' },
    requestType: RevokeDoctorMandateDto,
    requestExample: DOCTOR_MANDATE_EXAMPLES.revokeRequest,
    notFoundDescription: 'Doctor or mandate not found.',
  })
  async revokeMandate(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RevokeDoctorMandateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorMandateService.revokeMandate(
        doctorId,
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Mandate revoked',
    };
  }

  @Get(':id/instruction/download')
  @Auth([{ action: 'read', subject: 'DoctorMandate' }])
  @ApiEndpoint({
    summary: 'Sign a download of the written instruction',
    responseDescription:
      'A short-lived signed URL serving the signed instruction as an attachment under its stored type.',
    responseExample: { data: DOCTOR_MANDATE_EXAMPLES.download },
    notFoundDescription: 'Doctor or mandate not found.',
  })
  async getInstructionDownloadUrl(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.doctorMandateService.getInstructionDownloadUrl(doctorId, id) };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
