import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCTOR_CREDENTIAL_OPTION_EXAMPLES } from '../../../common/openapi/doctor-credential-option-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateDoctorCredentialOptionDto } from '../dto/create-doctor-credential-option.dto';
import { ListDoctorCredentialOptionsQueryDto } from '../dto/list-doctor-credential-options-query.dto';
import { UpdateDoctorCredentialOptionDto } from '../dto/update-doctor-credential-option.dto';
import { DoctorCredentialOptionService } from '../service/doctor-credential-option.service';

/**
 * Master data for the credentials that print alongside a doctor's name
 * (P19-T14): titles, degrees and education fields of study.
 *
 * Reads sit under `doctor.read` because everyone who can open the doctor form
 * needs the lists to render it, and writes under `doctor.update` because
 * extending the catalog is the same administrative act as editing a doctor —
 * an admin who may not change a doctor has no business inventing the
 * credentials doctors are described by.
 */
@ApiTags('Doctor Credential Options')
@Controller({
  version: '1',
  path: 'doctor-credential-options',
})
export class DoctorCredentialOptionController {
  constructor(private readonly doctorCredentialOptionService: DoctorCredentialOptionService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'List doctor credential options',
    responseDescription:
      'The credential catalog, ordered by kind then by the clinic’s own sort order. Active options only unless `includeInactive=true`, which the master-data screen uses so an admin can see and revive what was switched off.',
    responseExample: {
      data: [
        DOCTOR_CREDENTIAL_OPTION_EXAMPLES.title,
        DOCTOR_CREDENTIAL_OPTION_EXAMPLES.degree,
      ],
    },
  })
  async listDoctorCredentialOptions(@Query() query: ListDoctorCredentialOptionsQueryDto) {
    return {
      data: await this.doctorCredentialOptionService.listOptions(query),
    };
  }

  @Post()
  @Auth([{ action: 'update', subject: 'Doctor' }])
  @Audited({ resource: 'doctor-credential-options', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Add a doctor credential option',
    responseDescription:
      'Adds one option to a kind. The code is what doctor profiles store, so it is fixed at creation and never rewritten — an option whose printed form changes gets a new label instead.',
    responseExample: {
      data: DOCTOR_CREDENTIAL_OPTION_EXAMPLES.degree,
      message: 'Credential option created',
    },
    requestType: CreateDoctorCredentialOptionDto,
    requestExample: DOCTOR_CREDENTIAL_OPTION_EXAMPLES.createRequest,
  })
  async createDoctorCredentialOption(
    @Body() payload: CreateDoctorCredentialOptionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorCredentialOptionService.createOption(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Credential option created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Doctor' }])
  @Audited({ resource: 'doctor-credential-options', action: AuditAction.UPDATE, idParam: 'id' })
  @ApiEndpoint({
    summary: 'Edit or deactivate a doctor credential option',
    responseDescription:
      'Changes the printed label, the sort order, or whether the option is still offered. Deactivating never deletes: doctors who already store the code keep printing its label, they only stop being able to pick it anew.',
    responseExample: {
      data: { ...DOCTOR_CREDENTIAL_OPTION_EXAMPLES.degree, isActive: false },
      message: 'Credential option updated',
    },
    requestType: UpdateDoctorCredentialOptionDto,
    requestExample: DOCTOR_CREDENTIAL_OPTION_EXAMPLES.updateRequest,
    notFoundDescription: 'Credential option not found.',
  })
  async updateDoctorCredentialOption(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateDoctorCredentialOptionDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.doctorCredentialOptionService.updateOption(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Credential option updated',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
