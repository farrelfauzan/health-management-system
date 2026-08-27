import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { USER_INVITATION_EXAMPLES } from '../../../common/openapi/user-invitation-examples';
import { CreateUserInvitationDto } from '../dto/create-user-invitation.dto';
import { ListUserInvitationsQueryDto } from '../dto/list-user-invitations-query.dto';
import { UserInvitationService } from '../service/user-invitation.service';

/**
 * Administrator side of staff onboarding (IMP-23).
 *
 * Guarded by the `User` permissions that already exist rather than a new
 * `invitation.*` resource: inviting someone *is* creating a user, on a
 * schedule of the invitee's choosing, so anyone who may create a user may
 * invite one and nobody else may. A separate key would let a role hold one
 * without the other, which is not a distinction the clinic can act on.
 */
@ApiTags('Admin Management')
@Controller({
  version: '1',
  path: 'users/invitations',
})
export class UserInvitationAdminController {
  constructor(private readonly userInvitationService: UserInvitationService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'User' }])
  @ApiEndpoint({
    summary: 'List staff invitations',
    responseDescription:
      'Newest first, paged. Carries no token or token hash — the raw token exists only in the emailed link.',
    responseExample: {
      data: [USER_INVITATION_EXAMPLES.pending, USER_INVITATION_EXAMPLES.revoked],
      meta: USER_INVITATION_EXAMPLES.paginationMeta,
    },
  })
  async listInvitations(@Query() query: ListUserInvitationsQueryDto) {
    const result = await this.userInvitationService.listInvitations(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Invite a staff user by email',
    responseDescription:
      'The invitation was recorded and the email dispatched. A delivery failure does not fail this call — the invitation appears in the pending list with a resend action.',
    responseExample: {
      data: USER_INVITATION_EXAMPLES.pending,
      message: 'Invitation sent',
    },
    requestType: CreateUserInvitationDto,
    requestExample: USER_INVITATION_EXAMPLES.createRequest,
    successStatus: 201,
  })
  async createInvitation(
    @Body() payload: CreateUserInvitationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const invitation = await this.userInvitationService.createInvitation(
      payload,
      requireUserId(currentUser),
    );

    return {
      data: invitation,
      message: 'Invitation sent',
    };
  }

  @Post(':id/resend')
  @HttpCode(201)
  @Auth([{ action: 'update', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Resend a staff invitation',
    responseDescription:
      'A fresh token and expiry were issued. The previous link stops working immediately, whether or not the new email is delivered.',
    responseExample: {
      data: USER_INVITATION_EXAMPLES.pending,
      message: 'Invitation resent',
    },
    successStatus: 201,
    notFoundDescription: 'Invitation not found.',
  })
  async resendInvitation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const invitation = await this.userInvitationService.resendInvitation(
      id,
      requireUserId(currentUser),
    );

    return {
      data: invitation,
      message: 'Invitation resent',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'update', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Revoke a staff invitation',
    responseDescription:
      'The link is dead. The row stays, so the withdrawal is readable after the fact.',
    responseExample: {
      data: USER_INVITATION_EXAMPLES.revoked,
      message: 'Invitation revoked',
    },
    notFoundDescription: 'Invitation not found.',
  })
  async revokeInvitation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const invitation = await this.userInvitationService.revokeInvitation(
      id,
      requireUserId(currentUser),
    );

    return {
      data: invitation,
      message: 'Invitation revoked',
    };
  }
}

function requireUserId(currentUser?: CurrentUser): string {
  if (!currentUser?.sub) {
    throw new UnauthorizedException('Missing authenticated user');
  }
  return currentUser.sub;
}
