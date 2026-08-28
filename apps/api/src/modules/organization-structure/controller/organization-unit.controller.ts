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
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ORGANIZATION_STRUCTURE_EXAMPLES } from '../../../common/openapi/organization-structure-examples';
import { CreateOrganizationUnitDto } from '../dto/create-organization-unit.dto';
import { ListOrganizationUnitsQueryDto } from '../dto/list-organization-units-query.dto';
import { MoveOrganizationUnitDto } from '../dto/move-organization-unit.dto';
import { UpdateOrganizationUnitDto } from '../dto/update-organization-unit.dto';
import { OrganizationUnitService } from '../service/organization-unit.service';

/**
 * The org chart (SJ-1). Reading is one grant and every write is another, so a
 * role can be composed that sees the structure without redrawing it — which is
 * what the admin screen's read-only mode renders from.
 */
@ApiTags('Organization Structure')
@Controller({
  version: '1',
  path: 'organization-units',
})
export class OrganizationUnitController {
  constructor(private readonly organizationUnitService: OrganizationUnitService) {}

  @Get('tree')
  @Auth([{ action: 'read', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Read the organization structure tree',
    responseDescription:
      'The whole chart in one call, nested and ordered by sortOrder then name. Pass rootId for a single subtree, or includeArchived=true to see archived units. memberCount is staff sitting directly in that unit, never a rolled-up total.',
    responseExample: { data: ORGANIZATION_STRUCTURE_EXAMPLES.tree },
  })
  async getTree(@Query() query: ListOrganizationUnitsQueryDto) {
    return { data: await this.organizationUnitService.getTree(query) };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'manage', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Create an organization unit',
    responseDescription:
      'The unit was created, as a root when parentId is omitted or null. Rejected with 400 when it would sit deeper than the six-level cap.',
    responseExample: {
      data: ORGANIZATION_STRUCTURE_EXAMPLES.unit,
      message: 'Organization unit created',
    },
    requestType: CreateOrganizationUnitDto,
    requestExample: ORGANIZATION_STRUCTURE_EXAMPLES.createRequest,
    successStatus: 201,
    notFoundDescription: 'Parent organization unit not found.',
  })
  async createUnit(
    @Body() payload: CreateOrganizationUnitDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const unit = await this.organizationUnitService.createUnit(payload, currentUser.sub);

    return { data: unit, message: 'Organization unit created' };
  }

  @Patch(':id')
  @Auth([{ action: 'manage', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Rename or re-kind an organization unit',
    responseDescription:
      'The updated unit. parentId is not accepted here — re-parenting rewrites every descendant’s ancestry and has its own endpoint and audit verb.',
    responseExample: {
      data: ORGANIZATION_STRUCTURE_EXAMPLES.unit,
      message: 'Organization unit updated',
    },
    requestType: UpdateOrganizationUnitDto,
    requestExample: ORGANIZATION_STRUCTURE_EXAMPLES.updateRequest,
    notFoundDescription: 'Organization unit not found.',
  })
  async updateUnit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateOrganizationUnitDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const unit = await this.organizationUnitService.updateUnit(id, payload, currentUser.sub);

    return { data: unit, message: 'Organization unit updated' };
  }

  @Patch(':id/move')
  @Auth([{ action: 'manage', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Move an organization unit to a new parent',
    responseDescription:
      'The unit and its whole subtree were re-parented. parentId null promotes it to a root. Rejected with 400 when the destination is the unit itself or one of its own sub-units, or when the moved subtree would breach the six-level cap.',
    responseExample: {
      data: ORGANIZATION_STRUCTURE_EXAMPLES.unit,
      message: 'Organization unit moved',
    },
    requestType: MoveOrganizationUnitDto,
    requestExample: ORGANIZATION_STRUCTURE_EXAMPLES.moveRequest,
    notFoundDescription: 'Organization unit or destination parent not found.',
  })
  async moveUnit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: MoveOrganizationUnitDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const unit = await this.organizationUnitService.moveUnit(id, payload, currentUser.sub);

    return { data: unit, message: 'Organization unit moved' };
  }

  @Post(':id/archive')
  @Auth([{ action: 'manage', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Archive an organization unit',
    responseDescription:
      'The unit was archived and leaves the default tree; the row and its members survive. Refused with 409 while live sub-units remain, because a hidden parent whose children still show would draw a structure the clinic does not have.',
    responseExample: { message: 'Organization unit archived' },
    notFoundDescription: 'Organization unit not found.',
  })
  async archiveUnit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.organizationUnitService.archiveUnit(id, currentUser.sub);

    return { message: 'Organization unit archived' };
  }

  @Delete(':id')
  @Auth([{ action: 'manage', subject: 'OrganizationUnit' }])
  @ApiEndpoint({
    summary: 'Permanently delete an organization unit',
    responseDescription:
      'For a unit created in error. Refused with 409 while it holds any sub-unit (archived ones included) or any member, since nothing may still point at a row that is about to stop existing.',
    responseExample: { message: 'Organization unit deleted' },
    notFoundDescription: 'Organization unit not found.',
  })
  async deleteUnit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    await this.organizationUnitService.deleteUnit(id, currentUser.sub);

    return { message: 'Organization unit deleted' };
  }
}
