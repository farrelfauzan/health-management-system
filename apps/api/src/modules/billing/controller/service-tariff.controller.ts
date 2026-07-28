import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BILLING_EXAMPLES } from '../../../common/openapi/billing-examples';
import { CreateServiceTariffDto } from '../dto/create-service-tariff.dto';
import { ListServiceTariffsQueryDto } from '../dto/list-service-tariffs-query.dto';
import { UpdateServiceTariffDto } from '../dto/update-service-tariff.dto';
import { ServiceTariffService } from '../service/service-tariff.service';

@ApiTags('Service Tariffs')
@Controller({
  version: '1',
  path: 'service-tariffs',
})
export class ServiceTariffController {
  constructor(private readonly serviceTariffService: ServiceTariffService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ServiceTariff' }])
  @ApiEndpoint({
    summary: 'List service tariffs',
    responseDescription: 'The filtered, paginated price list.',
    responseExample: {
      data: [BILLING_EXAMPLES.serviceTariff.listItem],
      meta: BILLING_EXAMPLES.paginationMeta,
    },
  })
  async listServiceTariffs(@Query() query: ListServiceTariffsQueryDto) {
    const result = await this.serviceTariffService.listServiceTariffs(query);

    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'ServiceTariff' }])
  @ApiEndpoint({
    summary: 'Create a service tariff',
    responseDescription: 'The price-list row was created.',
    responseExample: {
      data: BILLING_EXAMPLES.serviceTariff.listItem,
      message: 'Service tariff created',
    },
    requestType: CreateServiceTariffDto,
    requestExample: BILLING_EXAMPLES.serviceTariff.createRequest,
    successStatus: 201,
  })
  async createServiceTariff(@Body() payload: CreateServiceTariffDto) {
    const tariff = await this.serviceTariffService.createServiceTariff(payload);

    return {
      data: tariff,
      message: 'Service tariff created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'ServiceTariff' }])
  @ApiEndpoint({
    summary: 'Update a service tariff',
    responseDescription:
      'The price-list row was updated. Repricing never rewrites issued invoices — their items are snapshots.',
    responseExample: {
      data: BILLING_EXAMPLES.serviceTariff.listItem,
      message: 'Service tariff updated',
    },
    requestType: UpdateServiceTariffDto,
    requestExample: BILLING_EXAMPLES.serviceTariff.updateRequest,
    notFoundDescription: 'Service tariff not found.',
  })
  async updateServiceTariff(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateServiceTariffDto,
  ) {
    const tariff = await this.serviceTariffService.updateServiceTariff(id, payload);

    return {
      data: tariff,
      message: 'Service tariff updated',
    };
  }
}
