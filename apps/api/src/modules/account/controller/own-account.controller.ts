import { Body, Controller, Get, Patch, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { UpdateOwnAccountDto } from '../dto/update-own-account.dto';
import { OwnAccountService } from '../service/own-account.service';

/**
 * The signed-in person's own account (P20-T05, D-027).
 *
 * `me/account` rather than a literal segment under `users`: that prefix is the
 * administrative one, guarded by `user.*:any`, and a self-service route living
 * inside it would be one decorator away from being read as an admin route.
 */
@ApiTags('Account')
@Controller({
  version: '1',
  path: 'me/account',
})
export class OwnAccountController {
  constructor(private readonly ownAccountService: OwnAccountService) {}

  @Get()
  @Auth([{ action: 'update', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Get my account',
    responseDescription:
      'The signed-in account: its id, sign-in address and name. The name is null for an account created before names were collected, which is not an error.',
    responseExample: {
      data: {
        id: '7f3a9c62-1d54-4c8b-9f2e-6b0a1d3c5e7f',
        email: 'apoteker@klinik.id',
        fullName: 'Rani Putri, S.Farm., Apt.',
      },
    },
  })
  async getOwnAccount(@AuthUser() currentUser?: CurrentUser) {
    return { data: await this.ownAccountService.getOwnAccount(this.requireUserId(currentUser)) };
  }

  @Patch()
  @Auth([{ action: 'update', subject: 'User' }])
  @ApiEndpoint({
    summary: 'Correct the name on my account',
    responseDescription:
      "Sets the caller's own name. Roles, status, organisation unit and the sign-in address are administrative and cannot be changed here.",
    requestType: UpdateOwnAccountDto,
    requestExample: { fullName: 'Rani Putri, S.Farm., Apt.' },
    responseExample: {
      data: {
        id: '7f3a9c62-1d54-4c8b-9f2e-6b0a1d3c5e7f',
        email: 'apoteker@klinik.id',
        fullName: 'Rani Putri, S.Farm., Apt.',
      },
      message: 'Name updated',
    },
  })
  async updateOwnAccount(
    @Body() payload: UpdateOwnAccountDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.ownAccountService.renameOwnAccount(
        this.requireUserId(currentUser),
        payload.fullName,
      ),
      message: 'Name updated',
    };
  }

  private requireUserId(currentUser?: CurrentUser): string {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser.sub;
  }
}
