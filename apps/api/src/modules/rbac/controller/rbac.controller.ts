import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { UnassignRoleDto } from '../dto/unassign-role.dto';
import { RbacService } from '../service/rbac.service';

@ApiTags('RBAC')
@Controller({
  version: '1',
  path: 'rbac',
})
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Auth([{ action: 'read', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'List active roles',
    responseDescription: 'All active roles available for assignment.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.rbac.roleItem],
    },
  })
  async getRoles() {
    const roles = await this.rbacService.getRoles();

    return {
      data: roles,
    };
  }

  @Post('assign-role')
  @HttpCode(200)
  @Auth([{ action: 'assign', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Assign a role to a user',
    responseDescription: 'The created or restored role assignment.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.assignment,
      message: 'Role assigned',
    },
    requestType: AssignRoleDto,
    requestExample: PHASE_THREE_EXAMPLES.rbac.assignRequest,
    notFoundDescription: 'Role not found.',
  })
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
  @ApiEndpoint({
    summary: 'Unassign a role from a user',
    responseDescription: 'The revoked role assignment.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.unassignment,
      message: 'Role unassigned',
    },
    requestType: UnassignRoleDto,
    requestExample: PHASE_THREE_EXAMPLES.rbac.assignRequest,
    notFoundDescription: 'Role assignment not found.',
  })
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
