import { Body, Controller, Get, Put, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { UpdateTaxCategoryDefaultsDto } from '../dto/update-tax-category-defaults.dto';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';

/** The code each tariff category and every medication falls back to (P27-T03). */
@ApiTags('Tax Codes')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/category-defaults' })
export class TaxCategoryDefaultController {
  constructor(private readonly taxCodeService: TaxCodeService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'List the tax code defaults',
    responseDescription:
      'One row per target that has a default. A target missing here resolves to no code, which the assignment list counts as unresolved.',
    responseExample: { data: TAXES_EXAMPLES.categoryDefaults.list },
  })
  async listCategoryDefaults() {
    return { data: await this.taxCodeService.listCategoryDefaultViews() };
  }

  @Put()
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Set tax code defaults',
    responseDescription:
      'Sets the named targets in one transaction; targets left out keep their default, and `taxCodeId: null` removes one. Each code must exist and be active (409 `TAX_CODE_INACTIVE`).',
    responseExample: {
      data: TAXES_EXAMPLES.categoryDefaults.list,
      message: 'Tax defaults updated',
    },
    requestType: UpdateTaxCategoryDefaultsDto,
    requestExample: TAXES_EXAMPLES.categoryDefaults.updateRequest,
  })
  async updateCategoryDefaults(
    @Body() payload: UpdateTaxCategoryDefaultsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return {
      data: await this.taxCodeService.updateCategoryDefaults(payload, currentUser),
      message: 'Tax defaults updated',
    };
  }
}
