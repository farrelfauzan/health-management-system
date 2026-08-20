import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { FEATURE_ENTITLEMENT_EXAMPLES } from '../../../common/openapi/feature-entitlement-examples';
import { FeatureEntitlementService } from '../service/feature-entitlement.service';

/**
 * What this deployment may offer, for the client that has to render it
 * (IMP-7). Separate from the admin controller because the payloads are not
 * the same answer at a different privilege level: this one is deliberately
 * only the enabled keys. `notes` names internal commercial reasoning and
 * `updatedById` names a colleague, and neither belongs in a response every
 * signed-in patient can fetch.
 *
 * Guarded by its own action, `feature.read-availability:own`, rather than by
 * a narrower scope of the admin grant. `PermissionsGuard` matches on action
 * and subject and never on scope, so `feature.read:own` would have opened
 * `GET /admin/features` — notes and all — to every signed-in patient. The
 * catalog already splits an action this way for `patient.read-identifier`.
 */
@ApiTags('Feature Entitlements')
@Controller({
  version: '1',
  path: 'features',
})
export class FeatureAvailabilityController {
  constructor(private readonly featureEntitlementService: FeatureEntitlementService) {}

  @Get('availability')
  @Auth([{ action: 'read-availability', subject: 'FeatureEntitlement' }])
  @ApiEndpoint({
    summary: 'List the features this client may use',
    responseDescription:
      'The enabled feature keys. Answers 200 even when everything is off, so a client can tell "nothing enabled" from "the call failed" — a client that cannot will either hide a feature the clinic bought or offer one it did not.',
    responseExample: { data: FEATURE_ENTITLEMENT_EXAMPLES.availability },
  })
  async getAvailability(@AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const view = await this.featureEntitlementService.getAvailability();

    return { data: view };
  }
}
