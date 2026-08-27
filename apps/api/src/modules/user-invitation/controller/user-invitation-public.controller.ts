import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { USER_INVITATION_EXAMPLES } from '../../../common/openapi/user-invitation-examples';
import { AcceptUserInvitationDto } from '../dto/accept-user-invitation.dto';
import { UserInvitationService } from '../service/user-invitation.service';

/**
 * The invitee's side of staff onboarding (IMP-23), reached from the emailed
 * link before any session exists.
 *
 * Public by necessity and not by exception: the caller is a person who does
 * not have an account yet, and the invitation token is the credential. It is
 * 256 bits from the CSPRNG and stored only as a SHA-256, so possession of the
 * link is the whole proof — which is the same bargain every password-reset
 * link in the world makes, and the reason the token lives in the path rather
 * than a body: the page that renders this flow is navigated to, not posted to.
 *
 * The token appearing in a URL is why `expiresAt` is short and why a resend
 * revokes: browser history, proxy logs and the Referer header all see it, and
 * the mitigation for that is a link with a short life and exactly one use, not
 * pretending the URL is private.
 */
@ApiTags('Admin Management')
@Controller({
  version: '1',
  path: 'invitations',
})
export class UserInvitationPublicController {
  constructor(private readonly userInvitationService: UserInvitationService) {}

  @Get(':token')
  @PublicRoute()
  @ApiEndpoint({
    summary: 'Validate an invitation link',
    responseDescription:
      "The address the invitation was sent to, so the invitee can confirm they opened the right link. Roles are omitted: publishing the clinic's role catalogue on an unauthenticated URL buys the invitee nothing.",
    responseExample: { data: USER_INVITATION_EXAMPLES.preview },
    isPublic: true,
    notFoundDescription: 'No invitation matches this link.',
  })
  async previewInvitation(@Param('token') token: string) {
    const preview = await this.userInvitationService.previewInvitation(token);

    return { data: preview };
  }

  @Post(':token/accept')
  @HttpCode(201)
  @PublicRoute()
  @ApiEndpoint({
    summary: 'Accept an invitation and set a password',
    responseDescription:
      'The account is live and the invitation consumed. The password is chosen here and nowhere else — no administrator ever knows it.',
    responseExample: {
      data: USER_INVITATION_EXAMPLES.accepted,
      message: 'Invitation accepted',
    },
    requestType: AcceptUserInvitationDto,
    requestExample: USER_INVITATION_EXAMPLES.acceptRequest,
    successStatus: 201,
    isPublic: true,
    notFoundDescription: 'No invitation matches this link.',
  })
  async acceptInvitation(@Param('token') token: string, @Body() payload: AcceptUserInvitationDto) {
    const result = await this.userInvitationService.acceptInvitation(token, payload);

    return {
      data: result,
      message: 'Invitation accepted',
    };
  }
}
