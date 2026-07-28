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
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { ListRegistrationsQueryDto } from '../dto/list-registrations-query.dto';
import { QueueBoardQueryDto } from '../dto/queue-board-query.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';
import { RegistrationFlowService } from '../service/registration-flow.service';

@ApiTags('Registration Flow')
@Controller({
  version: '1',
  path: 'registrations',
})
export class RegistrationFlowController {
  constructor(private readonly registrationFlowService: RegistrationFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Registration' }])
  @ApiEndpoint({
    summary: 'List registrations',
    responseDescription: 'A permission-scoped, filtered, paginated registration list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.registration.listItem],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listRegistrations(
    @Query() query: ListRegistrationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.registrationFlowService.listRegistrations(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  // Declared before `:id` so the static segment is matched ahead of the UUID
  // route param.
  @Get('queue-board')
  @Auth([{ action: 'read', subject: 'Registration' }])
  @ApiEndpoint({
    summary: "Get a day's queue board",
    responseDescription:
      "The day's antrian in queue-number order with per-status counts; defaults to today in the clinic time zone.",
    responseExample: { data: PHASE_THREE_EXAMPLES.registration.queueBoard },
  })
  async getQueueBoard(
    @Query() query: QueueBoardQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const queueBoard = await this.registrationFlowService.getQueueBoard(query, currentUser);

    return {
      data: queueBoard,
    };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Registration' }])
  @ApiEndpoint({
    summary: 'Get a registration',
    responseDescription: 'The registration visible to the authenticated actor.',
    responseExample: { data: PHASE_THREE_EXAMPLES.registration.item },
    notFoundDescription: 'Registration not found.',
  })
  async getRegistrationById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const registration = await this.registrationFlowService.getRegistrationById(id, currentUser);

    return {
      data: registration,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Registration' }])
  @ApiEndpoint({
    summary: 'Create a registration',
    responseDescription: 'The registration was created.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.registration.item,
      message: 'Registration created',
    },
    requestType: CreateRegistrationDto,
    requestExample: PHASE_THREE_EXAMPLES.registration.createRequest,
    successStatus: 201,
  })
  async createRegistration(
    @Body() payload: CreateRegistrationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const registration = await this.registrationFlowService.createRegistration(
      payload,
      currentUser,
    );

    return {
      data: registration,
      message: 'Registration created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'Registration' }])
  @ApiEndpoint({
    summary: 'Update a registration',
    responseDescription: 'The registration was updated after transition validation.',
    responseExample: {
      data: {
        ...PHASE_THREE_EXAMPLES.registration.item,
        status: 'CHECKED_IN',
        checkedInAt: '2026-07-20T08:00:00.000Z',
      },
      message: 'Registration updated',
    },
    requestType: UpdateRegistrationDto,
    requestExample: PHASE_THREE_EXAMPLES.registration.updateRequest,
    notFoundDescription: 'Registration not found.',
  })
  async updateRegistration(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateRegistrationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const registration = await this.registrationFlowService.updateRegistration(
      id,
      payload,
      currentUser,
    );

    return {
      data: registration,
      message: 'Registration updated',
    };
  }
}
