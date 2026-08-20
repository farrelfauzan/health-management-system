import { Body, Controller, Get, Param, Put, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { FEATURE_ENTITLEMENT_EXAMPLES } from '../../../common/openapi/feature-entitlement-examples';
import { UpdateFeatureEntitlementDto } from '../dto/update-feature-entitlement.dto';
import { FeatureEntitlementService } from '../service/feature-entitlement.service';

/**
 * Who sold this clinic what (IMP-7). Guarded by `feature.manage:any`, which
 * the seed grants to SUPER_ADMIN alone: entitlements are the vendor's lever,
 * and a clinic admin who could switch its own features on would be an admin
 * who could grant themselves the modules they did not buy.
 */
@ApiTags('Feature Entitlements')
@Controller({
  version: '1',
  path: 'admin/features',
})
export class FeatureAdminController {
  constructor(private readonly featureEntitlementService: FeatureEntitlementService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'FeatureEntitlement' }])
  @ApiEndpoint({
    summary: 'List every feature and whether this client has it',
    responseDescription:
      'One row per FEATURE_CATALOG entry — the catalog definition joined to this deployment’s switch state, so the admin screen needs no second call for labels. A key with no stored row reads as enabled and carries no updatedAt.',
    responseExample: { data: [FEATURE_ENTITLEMENT_EXAMPLES.entitlement] },
  })
  async getEntitlements() {
    const entitlements = await this.featureEntitlementService.getEntitlements();

    return { data: entitlements };
  }

  @Put(':key')
  @Auth([{ action: 'manage', subject: 'FeatureEntitlement' }])
  @ApiEndpoint({
    summary: 'Switch a feature on or off for this client',
    responseDescription:
      'The updated row. Takes effect on the next request — availability reflects it immediately. Unknown keys answer 404: the catalog is code-owned, so a key that is not in it would be a switch controlling nothing.',
    responseExample: {
      data: FEATURE_ENTITLEMENT_EXAMPLES.entitlement,
      message: 'Feature entitlement updated',
    },
    requestType: UpdateFeatureEntitlementDto,
    requestExample: FEATURE_ENTITLEMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Unknown feature key.',
  })
  async updateEntitlement(
    @Param('key') featureKey: string,
    @Body() payload: UpdateFeatureEntitlementDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const entitlement = await this.featureEntitlementService.updateEntitlement(
      featureKey,
      payload,
      currentUser.sub,
    );

    return { data: entitlement, message: 'Feature entitlement updated' };
  }
}
