import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ORGANIZATION_STRUCTURE_EXAMPLES } from '../../../common/openapi/organization-structure-examples';
import { ListOrganizationUnitMembersQueryDto } from '../dto/list-organization-unit-members-query.dto';
import { OrganizationUnitMemberService } from '../service/organization-unit-member.service';

/**
 * Who sits in which unit (SJ-89).
 *
 * Reading the roster rides on the structure read grant — seeing the chart
 * includes seeing who is on it — but every write demands
 * `organization.member.manage`, which is a different grant from the one that
 * lets someone redraw the chart. That split is the whole reason these routes
 * are not on `OrganizationUnitController`.
 */
@ApiTags('Organization Structure')
@Controller({
  version: '1',
  path: 'organization-units/:id/members',
})
export class OrganizationUnitMemberController {
  constructor(private readonly organizationUnitMemberService: OrganizationUnitMemberService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'List the staff assigned to an organization unit',
    responseDescription:
      'People sitting directly in this unit, never rolled up from its sub-units, ordered by email. Readable for an archived unit too — "who is still in the unit we just wound down" is exactly when the question gets asked.',
    responseExample: {
      data: [ORGANIZATION_STRUCTURE_EXAMPLES.member],
      meta: ORGANIZATION_STRUCTURE_EXAMPLES.memberListMeta,
    },
    notFoundDescription: 'Organization unit not found.',
  })
  async listMembers(
    @Param('id', new ParseUUIDPipe()) organizationUnitId: string,
    @Query() query: ListOrganizationUnitMembersQueryDto,
  ) {
    const result = await this.organizationUnitMemberService.listMembers(organizationUnitId, query);

    return { data: result.items, meta: result.meta };
  }

  @Put(':userId')
  @Auth([{ action: 'manage', subject: 'OrganizationUnitMember' }])
  @ApiEndpoint({
    summary: 'Assign a person to an organization unit',
    responseDescription:
      'The person now sits in this unit. Someone already assigned elsewhere is moved — a person belongs to one unit, so this is a reassignment rather than an error, and the audit row carries the unit they came from. Refused with 409 if they are already in this unit, and with 404 if the unit is archived or absent.',
    responseExample: {
      data: ORGANIZATION_STRUCTURE_EXAMPLES.member,
      message: 'Member assigned',
    },
    notFoundDescription: 'Organization unit or user not found.',
  })
  async assignMember(
    @Param('id', new ParseUUIDPipe()) organizationUnitId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const member = await this.organizationUnitMemberService.assignMember(
      organizationUnitId,
      userId,
      currentUser.sub,
    );

    return { data: member, message: 'Member assigned' };
  }

  @Delete(':userId')
  @HttpCode(200)
  @Auth([{ action: 'manage', subject: 'OrganizationUnitMember' }])
  @ApiEndpoint({
    summary: 'Remove a person from an organization unit',
    responseDescription:
      'The person no longer belongs to any unit. Refused with 409 when they are not in the unit named in the path, so a stale screen cannot unassign someone from a unit they have already left.',
    responseExample: { message: 'Member removed' },
    notFoundDescription: 'Organization unit or user not found.',
  })
  async unassignMember(
    @Param('id', new ParseUUIDPipe()) organizationUnitId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.organizationUnitMemberService.unassignMember(
      organizationUnitId,
      userId,
      currentUser.sub,
    );

    return { message: 'Member removed' };
  }
}
