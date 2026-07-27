import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { CreateMedicationDto } from '../dto/create-medication.dto';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'medications',
})
export class MedicationController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'List medications',
    responseDescription: 'A searchable, paginated medication inventory list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.pharmacy.medication],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listMedications(
    @Query() query: ListMedicationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.pharmacyFlowService.listMedications(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Create a medication',
    responseDescription: 'The medication was added to the catalog.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.medication,
      message: 'Medication created',
    },
    requestType: CreateMedicationDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.medicationCreateRequest,
    successStatus: 201,
  })
  async createMedication(
    @Body() payload: CreateMedicationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const medication = await this.pharmacyFlowService.createMedication(payload, currentUser);

    return {
      data: medication,
      message: 'Medication created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'Update a medication',
    responseDescription: 'The medication catalog entry was updated.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.pharmacy.medication,
      message: 'Medication updated',
    },
    requestType: UpdateMedicationDto,
    requestExample: PHASE_THREE_EXAMPLES.pharmacy.medicationUpdateRequest,
    notFoundDescription: 'Medication not found.',
  })
  async updateMedication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateMedicationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const medication = await this.pharmacyFlowService.updateMedication(id, payload, currentUser);

    return {
      data: medication,
      message: 'Medication updated',
    };
  }
}
