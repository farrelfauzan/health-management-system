import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AssignRoleDto } from '../dto/assign-role.dto';
import { CreateRoleDto } from '../dto/create-role.dto';
import { SetRolePermissionsDto } from '../dto/set-role-permissions.dto';
import { UnassignRoleDto } from '../dto/unassign-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
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

  @Get('permissions')
  @Auth([{ action: 'read', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'List the permission catalog',
    responseDescription:
      'Every seeded permission (`resource.action:scope`), grouped by resource. The catalog is code-owned; roles are composed from it.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.rbac.permissionGroup],
    },
  })
  async getPermissionCatalog() {
    const groups = await this.rbacService.getPermissionCatalog();

    return {
      data: groups,
    };
  }

  @Get('roles/:id')
  @Auth([{ action: 'read', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Get a role with its permissions and member count',
    responseDescription: 'The role, its attached permissions, and how many active users hold it.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.roleDetail,
    },
    notFoundDescription: 'Role not found.',
  })
  async getRoleById(@Param('id', new ParseUUIDPipe()) roleId: string) {
    const role = await this.rbacService.getRoleById(roleId);

    return {
      data: role,
    };
  }

  @Post('roles')
  @Auth([{ action: 'create', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Create a custom role',
    responseDescription: 'The created role. Custom roles are never system roles.',
    successStatus: 201,
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.customRoleItem,
      message: 'Role created',
    },
    requestType: CreateRoleDto,
    requestExample: PHASE_THREE_EXAMPLES.rbac.createRoleRequest,
  })
  async createRole(@Body() payload: CreateRoleDto) {
    const role = await this.rbacService.createRole(payload);

    return {
      data: role,
      message: 'Role created',
    };
  }

  @Patch('roles/:id')
  @Auth([{ action: 'update', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Update a role name or description',
    responseDescription: 'The updated role. Role codes are immutable.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.customRoleItem,
      message: 'Role updated',
    },
    requestType: UpdateRoleDto,
    requestExample: PHASE_THREE_EXAMPLES.rbac.updateRoleRequest,
    notFoundDescription: 'Role not found.',
  })
  async updateRole(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Body() payload: UpdateRoleDto,
  ) {
    const role = await this.rbacService.updateRole(roleId, payload);

    return {
      data: role,
      message: 'Role updated',
    };
  }

  @Delete('roles/:id')
  @HttpCode(200)
  @Auth([{ action: 'delete', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Soft-delete a role',
    responseDescription:
      'The deleted role. Every active assignment of the role is revoked in the same transaction.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.roleDeletion,
      message: 'Role deleted',
    },
    notFoundDescription: 'Role not found.',
  })
  async deleteRole(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.rbacService.deleteRole(roleId, currentUser.sub);

    return {
      data: result,
      message: 'Role deleted',
    };
  }

  @Put('roles/:id/permissions')
  @Auth([{ action: 'update', subject: 'Role' }])
  @ApiEndpoint({
    summary: 'Replace the permission set attached to a role',
    responseDescription:
      'The role after the replacement. Keys not in the catalog are rejected as a whole; nothing is partially applied.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.rbac.roleDetail,
      message: 'Role permissions updated',
    },
    requestType: SetRolePermissionsDto,
    requestExample: PHASE_THREE_EXAMPLES.rbac.setRolePermissionsRequest,
    notFoundDescription: 'Role not found.',
  })
  async setRolePermissions(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Body() payload: SetRolePermissionsDto,
  ) {
    const role = await this.rbacService.setRolePermissions(roleId, payload);

    return {
      data: role,
      message: 'Role permissions updated',
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
