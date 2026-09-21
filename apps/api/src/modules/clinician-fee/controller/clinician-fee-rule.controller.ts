import {
  Body,
  Controller,
  Delete,
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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CLINICIAN_FEE_EXAMPLES } from '../../../common/openapi/clinician-fee-examples';
import { CreateClinicianFeeRuleDto } from '../dto/create-clinician-fee-rule.dto';
import { UpdateClinicianFeeRuleDto } from '../dto/update-clinician-fee-rule.dto';
import { ClinicianFeeRuleService } from '../service/clinician-fee-rule.service';

/**
 * Jasa medis rules (P27-T06): the clinician's share of a tariff or a tariff
 * category. Not behind a feature switch, like the rest of billing: the ledger
 * these rules drive is written on every payment.
 */
@ApiTags('Clinician Fees')
@Controller({ version: '1', path: 'clinician-fee-rules' })
export class ClinicianFeeRuleController {
  constructor(private readonly clinicianFeeRuleService: ClinicianFeeRuleService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: 'List jasa medis rules',
    responseDescription:
      'Every live rule. `level` is where the rule sits in the precedence: CLINICIAN_TARIFF, TARIFF, CLINICIAN_CATEGORY, CATEGORY — the first level with a rule in force on the payment day prices the line.',
    responseExample: { data: [CLINICIAN_FEE_EXAMPLES.rules.view] },
  })
  async listRules() {
    return { data: await this.clinicianFeeRuleService.listRules() };
  }

  @Post()
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: 'Create a jasa medis rule',
    responseDescription:
      'Exactly one of `serviceTariffId` and `category`; without `doctorId` the rule applies to every clinician. PERCENT is 0–100 of the line, FIXED is rupiah per unit. 409 `CLINICIAN_FEE_RULE_OVERLAP` when a rule for the same target and clinician is in force on any of the dates; 400 `CLINICIAN_FEE_RULE_TARGET_INVALID` for an unknown tariff or clinician.',
    responseExample: {
      data: CLINICIAN_FEE_EXAMPLES.rules.view,
      message: 'Clinician fee rule created',
    },
    requestType: CreateClinicianFeeRuleDto,
    requestExample: CLINICIAN_FEE_EXAMPLES.rules.createRequest,
    successStatus: 201,
  })
  async createRule(
    @Body() payload: CreateClinicianFeeRuleDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.clinicianFeeRuleService.createRule(
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Clinician fee rule created',
    };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: 'Change the terms of a jasa medis rule',
    responseDescription:
      'Replaces mode, value and dates; target and clinician are fixed. Only later payments are affected — written entries keep their own snapshot. 409 `CLINICIAN_FEE_RULE_OVERLAP` as on create.',
    responseExample: {
      data: CLINICIAN_FEE_EXAMPLES.rules.view,
      message: 'Clinician fee rule updated',
    },
    requestType: UpdateClinicianFeeRuleDto,
    requestExample: CLINICIAN_FEE_EXAMPLES.rules.updateRequest,
  })
  async updateRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateClinicianFeeRuleDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.clinicianFeeRuleService.updateRule(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Clinician fee rule updated',
    };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'ClinicianFee' }])
  @ApiEndpoint({
    summary: 'Delete a jasa medis rule',
    responseDescription:
      'Soft delete: later payments no longer use it; entries already written are untouched.',
    responseExample: {
      data: { id: CLINICIAN_FEE_EXAMPLES.rules.view.id },
      message: 'Clinician fee rule deleted',
    },
  })
  async deleteRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    await this.clinicianFeeRuleService.deleteRule(id, this.assertAuthenticated(currentUser));
    return { data: { id }, message: 'Clinician fee rule deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Authentication is required');
    }
    return currentUser;
  }
}
