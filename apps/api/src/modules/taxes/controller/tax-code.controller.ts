import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { CreateTaxCodeRateDto } from '../dto/create-tax-code-rate.dto';
import { CreateTaxCodeDto } from '../dto/create-tax-code.dto';
import { UpdateTaxCodeDto } from '../dto/update-tax-code.dto';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';

/**
 * Tax codes and their effective-dated rates (P27-T03, `docs/post-mvp/decisions.md`
 * D-038). A rate change is a new rate row from its date, never an edit.
 */
@ApiTags('Tax Codes')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/codes' })
export class TaxCodeController {
  constructor(private readonly taxCodeService: TaxCodeService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'List tax codes with their rates',
    responseDescription:
      'System codes first. `currentRate` is the rate in force today in the clinic timezone; a later-dated rate is listed but not yet current. `defaultTargets` and `overrideCount` say where the code is used.',
    responseExample: { data: [TAXES_EXAMPLES.taxCodes.view] },
  })
  async listTaxCodes() {
    return { data: await this.taxCodeService.listTaxCodeViews() };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Create a tax code',
    responseDescription:
      'A clinic-defined code. The faktur code must match the treatment (08 exempt, 01 or 04 standard, none for not an object), and a STANDARD code arrives with its first rate. 409 `TAX_CODE_CONFLICT` when the code exists.',
    responseExample: { data: TAXES_EXAMPLES.taxCodes.view, message: 'Tax code created' },
    requestType: CreateTaxCodeDto,
    requestExample: TAXES_EXAMPLES.taxCodes.createRequest,
    successStatus: 201,
  })
  async createTaxCode(@Body() payload: CreateTaxCodeDto, @AuthUser() currentUser?: CurrentUser) {
    return {
      data: await this.taxCodeService.createTaxCode(payload, this.assertAuthenticated(currentUser)),
      message: 'Tax code created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Change a tax code',
    responseDescription:
      'Name, note, active flag, and on a clinic code the faktur code within its treatment. The treatment itself never changes. 409 `TAX_CODE_SYSTEM_LOCKED` for a system code faktur change; 409 `TAX_CODE_IN_USE` when deactivating a code a default or an item still uses.',
    responseExample: { data: TAXES_EXAMPLES.taxCodes.view, message: 'Tax code updated' },
    requestType: UpdateTaxCodeDto,
    requestExample: TAXES_EXAMPLES.taxCodes.updateRequest,
  })
  async updateTaxCode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateTaxCodeDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxCodeService.updateTaxCode(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Tax code updated',
    };
  }

  @Post(':id/rates')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Add a rate to a tax code',
    responseDescription:
      'Appends a rate in force from `effectiveFrom`, which must be after the latest one (409 `TAX_RATE_NOT_AFTER_LATEST`). Only a STANDARD code carries a rate (409 `TAX_RATE_NOT_APPLICABLE`). Invoices already issued keep the rate they were issued with.',
    responseExample: { data: TAXES_EXAMPLES.taxCodes.view, message: 'Tax rate added' },
    requestType: CreateTaxCodeRateDto,
    requestExample: TAXES_EXAMPLES.taxCodes.rateRequest,
    successStatus: 201,
  })
  async addTaxCodeRate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CreateTaxCodeRateDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.taxCodeService.addTaxCodeRate(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Tax rate added',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
