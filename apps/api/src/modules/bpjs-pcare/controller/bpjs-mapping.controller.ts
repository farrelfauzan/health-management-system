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

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { UpdateBpjsDoctorMappingDto } from '../dto/update-bpjs-doctor-mapping.dto';
import { UpdateBpjsDphoMappingDto } from '../dto/update-bpjs-dpho-mapping.dto';
import { UpdateBpjsPoliMappingDto } from '../dto/update-bpjs-poli-mapping.dto';
import { BpjsMappingService } from '../service/bpjs-mapping.service';

@ApiTags('BPJS PCare')
@RequireFeature('bpjs-pcare')
@Controller({
  version: '1',
  path: 'bpjs/mappings',
})
export class BpjsMappingController {
  constructor(private readonly mappingService: BpjsMappingService) {}

  @Get()
  @Auth([{ action: 'manage', subject: 'BpjsMapping' }])
  @ApiEndpoint({
    summary: 'Read the BPJS mapping overview',
    responseDescription:
      'Every active doctor and specialty with its current BPJS code (null when unmapped). Medication DPHO links are read off the medication list instead — the catalog is pageable there.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.mappingOverview },
  })
  async getOverview(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const overview = await this.mappingService.getOverview();

    return { data: overview };
  }

  @Put('doctors/:doctorId')
  @Auth([{ action: 'manage', subject: 'BpjsMapping' }])
  @ApiEndpoint({
    summary: 'Set or clear a doctor’s BPJS kdDokter mapping',
    responseDescription:
      'The doctor with its updated BPJS code. A non-null code must exist in the synced DOKTER catalog; null clears the mapping.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.doctorMapping },
    requestType: UpdateBpjsDoctorMappingDto,
    requestExample: BPJS_PCARE_EXAMPLES.doctorMappingRequest,
    notFoundDescription: 'Doctor not found.',
  })
  async setDoctorMapping(
    @Param('doctorId', new ParseUUIDPipe()) doctorId: string,
    @Body() body: UpdateBpjsDoctorMappingDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const mapping = await this.mappingService.setDoctorMapping(doctorId, body, actor);

    return { data: mapping };
  }

  @Put('specialties/:specialtyId')
  @Auth([{ action: 'manage', subject: 'BpjsMapping' }])
  @ApiEndpoint({
    summary: 'Set or clear a specialty’s BPJS kdPoli mapping',
    responseDescription:
      'The specialty with its updated BPJS poli code. A non-null code must exist in the synced POLI catalog; null clears the mapping.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.specialtyMapping },
    requestType: UpdateBpjsPoliMappingDto,
    requestExample: BPJS_PCARE_EXAMPLES.poliMappingRequest,
    notFoundDescription: 'Specialty not found.',
  })
  async setSpecialtyMapping(
    @Param('specialtyId', new ParseUUIDPipe()) specialtyId: string,
    @Body() body: UpdateBpjsPoliMappingDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const mapping = await this.mappingService.setSpecialtyMapping(specialtyId, body, actor);

    return { data: mapping };
  }

  @Put('medications/:medicationId')
  @Auth([{ action: 'manage', subject: 'BpjsMapping' }])
  @ApiEndpoint({
    summary: 'Link or unlink a medication’s DPHO code',
    responseDescription:
      'The medication with its updated DPHO code. A non-null code must exist in the search-cached DPHO catalog and may be linked to at most one medication; null unlinks.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.medicationMapping },
    requestType: UpdateBpjsDphoMappingDto,
    requestExample: BPJS_PCARE_EXAMPLES.dphoMappingRequest,
    notFoundDescription: 'Medication not found.',
  })
  async setMedicationMapping(
    @Param('medicationId', new ParseUUIDPipe()) medicationId: string,
    @Body() body: UpdateBpjsDphoMappingDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const mapping = await this.mappingService.setMedicationMapping(medicationId, body, actor);

    return { data: mapping };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
