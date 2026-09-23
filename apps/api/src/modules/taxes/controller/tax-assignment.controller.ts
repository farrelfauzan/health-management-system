import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { TAXES_EXAMPLES } from '../../../common/openapi/taxes-examples';
import { BulkAssignCoretaxCodesDto } from '../dto/bulk-assign-coretax-codes.dto';
import { BulkAssignTaxCodeDto } from '../dto/bulk-assign-tax-code.dto';
import { ListTaxAssignmentsQueryDto } from '../dto/list-tax-assignments-query.dto';
import { TaxAssignmentService } from '../service/tax-assignment.service';

/** The tax code on every active tariff and medication (P27-T03). */
@ApiTags('Tax Codes')
@RequireFeature('taxes')
@Controller({ version: '1', path: 'tax/assignments' })
export class TaxAssignmentController {
  constructor(private readonly taxAssignmentService: TaxAssignmentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'List tariffs and medications with their tax code',
    responseDescription:
      'Every active tariff and every medication, resolved override → category default → unresolved, with `source` saying which. `meta.unresolvedCount` covers everything, not the page.',
    responseExample: {
      data: [TAXES_EXAMPLES.assignments.row],
      meta: TAXES_EXAMPLES.assignments.meta,
    },
  })
  async listAssignments(@Query() query: ListTaxAssignmentsQueryDto) {
    const result = await this.taxAssignmentService.listAssignments(query);
    return { data: result.items, meta: result.meta };
  }

  @Post('bulk')
  // An update of existing rows, not a creation: 200, as the contract says.
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Assign a tax code to many tariffs and medications',
    responseDescription:
      'Sets one code on every target in one transaction, or clears their override with `taxCodeId: null` so they follow their category default. 404 `TAX_ASSIGNMENT_TARGET_NOT_FOUND` names targets that no longer exist; 409 `TAX_CODE_INACTIVE` for an inactive code. Issued invoices are never touched.',
    responseExample: {
      data: TAXES_EXAMPLES.assignments.bulkResult,
      message: 'Tax code assigned',
    },
    requestType: BulkAssignTaxCodeDto,
    requestExample: TAXES_EXAMPLES.assignments.bulkRequest,
  })
  async bulkAssign(@Body() payload: BulkAssignTaxCodeDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return {
      data: await this.taxAssignmentService.bulkAssign(payload, currentUser),
      message: 'Tax code assigned',
    };
  }

  @Post('coretax-codes/bulk')
  // An update of existing rows, not a creation: 200, like the tax code bulk apply.
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'TaxCode' }])
  @ApiEndpoint({
    summary: 'Set the Coretax item code and unit on many tariffs and medications',
    responseDescription:
      "P27-T09. Overrides the tax code's Coretax item code (six digits) and unit (`UM.0001`–`UM.0039`, DJP's list) on every target in one transaction; `null` clears the override so the item follows its tax code. 404 `TAX_ASSIGNMENT_TARGET_NOT_FOUND` names targets that no longer exist. Issued invoices are never touched.",
    responseExample: {
      data: TAXES_EXAMPLES.assignments.bulkResult,
      message: 'Coretax codes assigned',
    },
    requestType: BulkAssignCoretaxCodesDto,
    requestExample: TAXES_EXAMPLES.assignments.coretaxBulkRequest,
  })
  async bulkAssignCoretaxCodes(
    @Body() payload: BulkAssignCoretaxCodesDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return {
      data: await this.taxAssignmentService.bulkAssignCoretaxCodes(payload, currentUser),
      message: 'Coretax codes assigned',
    };
  }
}
