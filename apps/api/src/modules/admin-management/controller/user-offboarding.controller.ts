import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequestOrigin } from '../../../common/observability/request-context.decorator';
import { RequestContext } from '../../../common/observability/observability.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { UserOffboardingService } from '../service/user-offboarding.service';

/**
 * A person's offboarding window (`P16-T41`, §7.3.10): preview it, open it,
 * cancel it.
 *
 * Its own controller on its own prefix rather than three more routes on
 * `AdminManagementController`: that controller mounts `GET /users` and
 * `PATCH /users/:id`, and `P16-T34`'s recipient lookup showed what a
 * sibling route under a shared prefix costs when Express matches
 * first-registered-wins. One resource, three verbs, no literal segment for
 * a `:id` to swallow.
 *
 * Every route needs `user.offboard:any`, a key no seeded role holds — only
 * SUPER_ADMIN's catalog-wide grant satisfies it, and
 * `user-offboarding-rbac-seed.spec.ts` fails if that changes. This is a
 * super-admin action and not deactivation; the `PATCH` that deactivates stays
 * exactly where it was.
 */
@ApiTags('Admin Management')
@Controller({
  version: '1',
  path: 'users/:id/offboarding',
})
export class UserOffboardingController {
  constructor(private readonly userOffboardingService: UserOffboardingService) {}

  @Get()
  @Auth([{ action: 'offboard', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Preview what offboarding a user would delete and keep',
    responseDescription:
      'How many of the person’s vault documents will survive because they are shared (readable by their recipients), how many will be hard-deleted, and on which clinic calendar day (FR-E3-31). `offboardedAt` is set when the person is already in their window.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.admin.offboardingPreview,
    },
    notFoundDescription: 'User not found.',
  })
  async previewOffboarding(@Param('id', new ParseUUIDPipe()) id: string) {
    const preview = await this.userOffboardingService.previewOffboarding(id);

    return { data: preview };
  }

  @Post()
  @HttpCode(200)
  @Auth([{ action: 'offboard', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Offboard a user into the 30-day export-only window',
    responseDescription:
      'Not deactivation. Sets `offboardedAt`, revokes every session so the reduced capability set takes effect on the person’s next request, emails them the date and what will be deleted, and audits the action. Until the window closes they can sign in to view, download, export and delete their own vault documents and do nothing else (FR-E3-23…27). Refused for a deactivated user — deactivation already locks them out and must not be turned back into a month of access.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.admin.offboarded,
      message: 'User offboarded',
    },
    notFoundDescription: 'User not found.',
  })
  async offboardUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestOrigin() origin: RequestContext,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.userOffboardingService.offboardUser(id, actor, origin);

    return { data: result, message: 'User offboarded' };
  }

  @Delete()
  @HttpCode(200)
  @Auth([{ action: 'offboard', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Re-onboard a user, cancelling their offboarding window',
    responseDescription:
      'Clears `offboardedAt`, cancels the scheduled deletion and restores normal access on the person’s next request (FR-E3-30). Anything the end-of-window purge already removed is gone.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.admin.offboardingPreview,
      message: 'User re-onboarded',
    },
    notFoundDescription: 'User not found.',
  })
  async reonboardUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @RequestOrigin() origin: RequestContext,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.userOffboardingService.reonboardUser(id, actor, origin);

    return { data: result, message: 'User re-onboarded' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
