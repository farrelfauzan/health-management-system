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
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateSpecialtyDto } from '../dto/create-specialty.dto';
import { ListSpecialtiesQueryDto } from '../dto/list-specialties-query.dto';
import { UpdateSpecialtyDto } from '../dto/update-specialty.dto';
import { SpecialtyService } from '../service/specialty.service';

/**
 * The poli catalog. Reads stay under `doctor.read`, because everyone who opens
 * a doctor form or a tariff form needs the list; changes need
 * `specialty.manage:any`, which only the clinic's administrators hold.
 */
@ApiTags('Specialty')
@Controller({
  version: '1',
  path: 'specialties',
})
export class SpecialtyController {
  constructor(private readonly specialtyService: SpecialtyService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'List specialties',
    responseDescription:
      'The poli catalog, ordered by name. Active and inactive together unless `isActive` narrows it; pickers ask for `isActive=true`.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.specialty.item] },
  })
  async listSpecialties(@Query() query: ListSpecialtiesQueryDto) {
    const specialties = await this.specialtyService.listSpecialties(query);
    return {
      data: specialties,
    };
  }

  @Post()
  @Auth([{ action: 'manage', subject: 'Specialty' }])
  @Audited({ resource: 'specialties', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Add a poli',
    responseDescription:
      'Adds one poli to the catalog. Refused with 409 SPECIALTY_NAME_TAKEN when another poli already has the name, compared without regard to case.',
    responseExample: {
      data: { ...PHASE_THREE_EXAMPLES.specialty.item, name: 'Kebidanan' },
      message: 'Poli created',
    },
    requestType: CreateSpecialtyDto,
    requestExample: { name: 'Kebidanan', description: 'Pelayanan bidan: ANC, persalinan, nifas, KB' },
  })
  async createSpecialty(@Body() payload: CreateSpecialtyDto, @AuthUser() currentUser?: CurrentUser) {
    return {
      data: await this.specialtyService.createSpecialty(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Poli created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'manage', subject: 'Specialty' }])
  @Audited({ resource: 'specialties', action: AuditAction.UPDATE, idParam: 'id' })
  @ApiEndpoint({
    summary: 'Rename, deactivate or reactivate a poli',
    responseDescription:
      'Changes the name or description, or whether the poli is still offered. Never deletes. Deactivation is refused with 409 SPECIALTY_IN_USE, the counts in `details`, while an active clinician practises under the poli or an active tariff prices it.',
    responseExample: {
      data: { ...PHASE_THREE_EXAMPLES.specialty.item, isActive: false },
      message: 'Poli updated',
    },
    requestType: UpdateSpecialtyDto,
    requestExample: { isActive: false },
    notFoundDescription: 'Specialty not found',
  })
  async updateSpecialty(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateSpecialtyDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.specialtyService.updateSpecialty(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Poli updated',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
