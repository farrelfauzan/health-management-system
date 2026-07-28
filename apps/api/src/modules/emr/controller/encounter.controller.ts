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
import { ListEncountersQueryDto } from '../dto/list-encounters-query.dto';
import { OpenEncounterDto } from '../dto/open-encounter.dto';
import { UpdateEncounterSoapDto } from '../dto/update-encounter-soap.dto';
import { EncounterService } from '../service/encounter.service';

@ApiTags('Encounters')
@Controller({
  version: '1',
  path: 'encounters',
})
export class EncounterController {
  constructor(private readonly encounterService: EncounterService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'List clinical encounters',
    responseDescription: 'A permission-scoped, filtered, paginated encounter list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.encounter.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listEncounters(
    @Query() query: ListEncountersQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.encounterService.listEncounters(query, actor);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Get a clinical encounter',
    responseDescription:
      'The full record of one visit: SOAP note, vitals, coded diagnoses and procedures, and the prescriptions written during it.',
    responseExample: { data: PHASE_THREE_EXAMPLES.encounter.detail },
    notFoundDescription: 'Encounter not found.',
  })
  async getEncounterById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const encounter = await this.encounterService.getEncounterById(id, actor);

    return {
      data: encounter,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Open a clinical encounter',
    responseDescription: 'The encounter was opened for a CHECKED_IN registration.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.listItem,
      message: 'Encounter opened',
    },
    requestType: OpenEncounterDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.openRequest,
    successStatus: 201,
  })
  async openEncounter(@Body() payload: OpenEncounterDto, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const encounter = await this.encounterService.openEncounter(payload, actor);

    return {
      data: encounter,
      message: 'Encounter opened',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Write the SOAP note',
    responseDescription: 'The narrative record was updated. Only IN_PROGRESS encounters accept it.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.listItem,
      message: 'Encounter updated',
    },
    requestType: UpdateEncounterSoapDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.soapRequest,
    notFoundDescription: 'Encounter not found.',
  })
  async updateEncounterSoap(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateEncounterSoapDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const encounter = await this.encounterService.updateEncounterSoap(id, payload, actor);

    return {
      data: encounter,
      message: 'Encounter updated',
    };
  }

  @Post(':id/close')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Close a clinical encounter',
    responseDescription:
      'The encounter is FINISHED and its registration COMPLETED, in one transaction.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.encounter.listItem,
        status: 'FINISHED',
        endedAt: '2026-07-20T08:30:00.000Z',
      },
      message: 'Encounter closed',
    },
    notFoundDescription: 'Encounter not found.',
  })
  async closeEncounter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const encounter = await this.encounterService.closeEncounter(id, actor);

    return {
      data: encounter,
      message: 'Encounter closed',
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Cancel a clinical encounter',
    responseDescription:
      'The encounter was opened in error and is retracted with its registration. Records are never re-opened; the patient re-registers.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.encounter.listItem,
        status: 'CANCELLED',
        endedAt: '2026-07-20T08:05:00.000Z',
      },
      message: 'Encounter cancelled',
    },
    notFoundDescription: 'Encounter not found.',
  })
  async cancelEncounter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const encounter = await this.encounterService.cancelEncounter(id, actor);

    return {
      data: encounter,
      message: 'Encounter cancelled',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
