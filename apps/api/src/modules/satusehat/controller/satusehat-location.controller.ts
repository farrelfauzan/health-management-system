import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { RegisterSatusehatLocationsDto } from '../dto/register-satusehat-locations.dto';
import { SatusehatLocationRegistrationService } from '../service/satusehat-location-registration.service';
import { SatusehatLocationTreeService } from '../service/satusehat-location-tree.service';

/** The "Lokasi SATUSEHAT" panel's two routes (P24-T06). */
@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat/locations',
})
export class SatusehatLocationController {
  constructor(
    private readonly satusehatLocationTreeService: SatusehatLocationTreeService,
    private readonly satusehatLocationRegistrationService: SatusehatLocationRegistrationService,
  ) {}

  @Get()
  @Auth([{ action: 'read', subject: 'SatusehatLocation' }])
  @ApiEndpoint({
    summary: "The clinic's SATUSEHAT Location tree",
    responseDescription:
      'Every row that registers as a SATUSEHAT Location — the root site, each poli, and the ward → room → bed tree — flat and parents first, with REGISTERED / UNREGISTERED / BLOCKED and the reason a row waits: missing clinic coordinates, an unmapped room class, or an unregistered parent (P24-T06).',
    responseExample: { data: SATUSEHAT_EXAMPLES.locationTree },
  })
  async listLocations(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    return { data: await this.satusehatLocationTreeService.getTree() };
  }

  @Post('register')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'SatusehatLocation' }])
  @ApiEndpoint({
    summary: 'Register clinic rows as SATUSEHAT Locations, or push their changes',
    responseDescription:
      'Runs sequentially in tree order, parents first. An unregistered row is looked up by identifier before any POST and adopted when SATUSEHAT already holds it; a registered row is sent again as a PUT, which is how a rename or a deactivation reaches SATUSEHAT. Every write is audited. A breaker-open or credential failure stops the batch: the rows after `processedCount` come back SKIPPED (P24-T06).',
    responseExample: { data: SATUSEHAT_EXAMPLES.locationRegistrationResult },
    notFoundDescription: 'A named target is not a registrable location.',
  })
  async registerLocations(
    @Body() payload: RegisterSatusehatLocationsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return {
      data: await this.satusehatLocationRegistrationService.registerLocations(payload, actor),
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
