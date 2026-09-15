import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCTOR_AUTHORITY_EXAMPLES } from '../../../common/openapi/doctor-authority-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateDoctorAuthorityDto } from '../dto/create-doctor-authority.dto';
import { CreateDoctorAuthorityUploadUrlDto } from '../dto/create-doctor-authority-upload-url.dto';
import { RevokeDoctorAuthorityDto } from '../dto/revoke-doctor-authority.dto';
import { UpdateDoctorAuthorityDto } from '../dto/update-doctor-authority.dto';
import { DoctorAuthorityService } from '../service/doctor-authority.service';

const AUDIT_RESOURCE = 'doctor-authority';

/**
 * A midwife's delegated authorities — *kewenangan* (P25-T02, Permenkes
 * 28/2017 Pasal 23–26). Its own controller and its own permission pair
 * (`doctor.authority.read/write:any`, ADMIN only): `doctor.read:any` is held
 * by doctors and patients, and what a midwife has been cleared to do is a
 * compliance record, not part of the directory.
 */
@ApiTags('Doctor Authorities')
@Controller({
  version: '1',
  path: 'doctors/:doctorId/authorities',
})
export class DoctorAuthorityController {
  constructor(private readonly doctorAuthorityService: DoctorAuthorityService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'DoctorAuthority' }])
  @ApiEndpoint({
    summary: 'List a clinician’s delegated authorities',
    responseDescription:
      'Every recorded authority of the clinician, live rows first, each with its status judged on the clinic’s calendar day. A profile that is not a midwife has none.',
    responseExample: { data: [DOCTOR_AUTHORITY_EXAMPLES.item] },
    notFoundDescription: 'Doctor not found.',
  })
  async listAuthorities(@Param('doctorId', new ParseUUIDPipe()) doctorId: string) {
    return { data: await this.doctorAuthorityService.listAuthorities(doctorId) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'DoctorAuthority' }])
  @Audited({ resource: AUDIT_RESOURCE, action: AuditAction.DOCTOR_AUTHORITY_GRANTED })
  @ApiEndpoint({
    summary: 'Grant a delegated authority',
    responseDescription:
      'Records one authority against a midwife. Refused with 422 `DOCTOR_AUTHORITY_REQUIRES_MIDWIFE` for any other profession and with 409 `DOCTOR_AUTHORITY_ALREADY_ACTIVE` while a live authority of the same kind exists — renew by editing its dates, or revoke and grant again. Every grant names its evidence (`grantKind`, `grantReference`, `grantIssuedAt`) and carries a training certificate and an end date (D-036). `grantDocumentStorageKey` must come from the upload-url route for this clinician.',
    responseExample: { data: DOCTOR_AUTHORITY_EXAMPLES.item, message: 'Authority granted' },
    requestType: CreateDoctorAuthorityDto,
    requestExample: DOCTOR_AUTHORITY_EXAMPLES.createRequest,
    successStatus: 201,
    notFoundDescription: 'Doctor not found.',
  })
  async createAuthority(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() payload: CreateDoctorAuthorityDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorAuthorityService.createAuthority(
        doctorId,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Authority granted',
    };
  }

  @Post('upload-url')
  @Auth([{ action: 'write', subject: 'DoctorAuthority' }])
  @ApiEndpoint({
    summary: 'Sign an upload of a grant document',
    responseDescription:
      'A presigned PUT under `doctor-authorities/{doctorId}/`. Nothing is recorded until a create or update names the returned `storageKey`; the API then reads the object back from storage before trusting it.',
    responseExample: { data: DOCTOR_AUTHORITY_EXAMPLES.uploadUrl },
    requestType: CreateDoctorAuthorityUploadUrlDto,
    requestExample: DOCTOR_AUTHORITY_EXAMPLES.uploadUrlRequest,
    notFoundDescription: 'Doctor not found.',
  })
  async createGrantDocumentUploadUrl(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() payload: CreateDoctorAuthorityUploadUrlDto,
  ) {
    return {
      data: await this.doctorAuthorityService.createGrantDocumentUploadUrl(doctorId, payload),
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'DoctorAuthority' }])
  @Audited({
    resource: AUDIT_RESOURCE,
    action: AuditAction.DOCTOR_AUTHORITY_UPDATED,
    idParam: 'id',
  })
  @ApiEndpoint({
    summary: 'Edit a delegated authority',
    responseDescription:
      'Changes the evidence, the dates or the grant document. The kind is fixed at grant: changing what an authority *is* is a revoke and a fresh grant. The end date can move but cannot be cleared, because every grant is end-dated (D-036); `grantDocumentStorageKey: null` detaches the document.',
    responseExample: { data: DOCTOR_AUTHORITY_EXAMPLES.item, message: 'Authority updated' },
    requestType: UpdateDoctorAuthorityDto,
    requestExample: DOCTOR_AUTHORITY_EXAMPLES.updateRequest,
    notFoundDescription: 'Doctor or authority not found.',
  })
  async updateAuthority(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDoctorAuthorityDto,
  ) {
    return {
      data: await this.doctorAuthorityService.updateAuthority(doctorId, id, payload),
      message: 'Authority updated',
    };
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'DoctorAuthority' }])
  @Audited({
    resource: AUDIT_RESOURCE,
    action: AuditAction.DOCTOR_AUTHORITY_REVOKED,
    idParam: 'id',
  })
  @ApiEndpoint({
    summary: 'Revoke a delegated authority',
    responseDescription:
      'Ends the authority now, recording who revoked it and why. The row stays for the audit trail; the same kind can be granted afresh afterwards.',
    responseExample: { data: DOCTOR_AUTHORITY_EXAMPLES.revokedItem, message: 'Authority revoked' },
    requestType: RevokeDoctorAuthorityDto,
    requestExample: DOCTOR_AUTHORITY_EXAMPLES.revokeRequest,
    notFoundDescription: 'Doctor or authority not found.',
  })
  async revokeAuthority(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RevokeDoctorAuthorityDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorAuthorityService.revokeAuthority(
        doctorId,
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Authority revoked',
    };
  }

  @Get(':id/grant-document/download')
  @Auth([{ action: 'read', subject: 'DoctorAuthority' }])
  @ApiEndpoint({
    summary: 'Sign a download of the grant document',
    responseDescription:
      'A short-lived signed URL serving the grant document as an attachment under its stored type.',
    responseExample: { data: DOCTOR_AUTHORITY_EXAMPLES.download },
    notFoundDescription: 'Doctor or authority not found, or no grant document is on file.',
  })
  async getGrantDocumentDownloadUrl(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return { data: await this.doctorAuthorityService.getGrantDocumentDownloadUrl(doctorId, id) };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
