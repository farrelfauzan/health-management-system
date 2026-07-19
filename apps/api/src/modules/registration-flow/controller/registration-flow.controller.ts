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

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { CreateRegistrationDto } from '../dto/create-registration.dto';
import { ListRegistrationsQueryDto } from '../dto/list-registrations-query.dto';
import { UpdateRegistrationDto } from '../dto/update-registration.dto';
import { RegistrationFlowService } from '../service/registration-flow.service';

@Controller({
  version: '1',
  path: 'registrations',
})
export class RegistrationFlowController {
  constructor(private readonly registrationFlowService: RegistrationFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Registration' }])
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

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Registration' }])
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
