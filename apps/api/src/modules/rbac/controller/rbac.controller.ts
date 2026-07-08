import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RbacService } from '../service/rbac.service';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { UnassignRoleDto } from '../dto/unassign-role.dto';

@Controller({
  version: '1',
  path: 'rbac',
})
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Auth([{ action: 'read', subject: 'Role' }])
  async getRoles() {
    const roles = await this.rbacService.getRoles();

    return {
      data: roles,
    };
  }

  @Post('assign-role')
  @HttpCode(200)
  @Auth([{ action: 'assign', subject: 'Role' }])
  async assignRole(@Body() payload: AssignRoleDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.rbacService.assignRole(
      payload.userId,
      payload.roleCode,
      currentUser.sub,
    );

    return {
      data: result,
      message: 'Role assigned',
    };
  }

  @Post('unassign-role')
  @HttpCode(200)
  @Auth([{ action: 'unassign', subject: 'Role' }])
  async unassignRole(@Body() payload: UnassignRoleDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.rbacService.unassignRole(
      payload.userId,
      payload.roleCode,
      currentUser.sub,
    );

    return {
      data: result,
      message: 'Role unassigned',
    };
  }
}
