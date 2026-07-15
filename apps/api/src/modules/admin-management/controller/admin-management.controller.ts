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
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateAdminUserDto } from '../dto/update-admin-user.dto';
import { AdminManagementService } from '../service/admin-management.service';

@Controller({
  version: '1',
  path: 'users',
})
export class AdminManagementController {
  constructor(private readonly adminManagementService: AdminManagementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'User' }])
  async listUsers(@Query() query: ListUsersQueryDto) {
    const result = await this.adminManagementService.listUsers(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'User' }])
  async createAdminUser(
    @Body() payload: CreateAdminUserDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const user = await this.adminManagementService.createAdminUser(payload, currentUser.sub);

    return {
      data: user,
      message: 'User created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'update', subject: 'User' }])
  async updateAdminUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateAdminUserDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const user = await this.adminManagementService.updateAdminUser(id, payload, currentUser.sub);

    return {
      data: user,
      message: 'User updated',
    };
  }
}
