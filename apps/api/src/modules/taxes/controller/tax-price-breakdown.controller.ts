import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { ListTaxPriceBreakdownsQueryDto } from '../dto/list-tax-price-breakdowns-query.dto';
import { TaxPriceBreakdownService } from '../service/tax-price-breakdown.service';

/** Before/after-PPN figures for the tariff and medicine lists, for admins (P27-T04). */
@ApiTags('Tax Codes')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/price-breakdowns' })
export class TaxPriceBreakdownController {
  constructor(private readonly taxPriceBreakdownService: TaxPriceBreakdownService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Split tariff or medicine prices into before-PPN and PPN',
    responseDescription:
      'One row per named item that exists, at the rate in force today: `TAXED` with the price before PPN and the PPN inside the price, `EXEMPT`, `NOT_PKP` (the clinic charges no PPN), `UNRESOLVED` (no code or rate) or `UNPRICED`. Prices are always tax-inclusive, so `price` is what the patient pays. For clinic staff only — the patient receipt shows one price and "Harga sudah termasuk PPN".',
    responseExample: { data: [TAXES_EXAMPLES.priceBreakdowns.row] },
  })
  async listPriceBreakdowns(@Query() query: ListTaxPriceBreakdownsQueryDto) {
    return { data: await this.taxPriceBreakdownService.listPriceBreakdowns(query) };
  }
}
