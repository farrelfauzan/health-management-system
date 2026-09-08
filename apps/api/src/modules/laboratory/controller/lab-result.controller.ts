import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { AmendLabResultDto } from '../dto/amend-lab-result.dto';
import { EnterLabResultsDto } from '../dto/enter-lab-results.dto';
import { LabResultService } from '../service/lab-result.service';

/**
 * Measured values: typing them, signing them out, and correcting one that has
 * already been acted on (`P18-T04`).
 *
 * Entry and release are addressed by the order because that is the unit the
 * bench works — a worksheet, not a number — while an amendment is addressed by
 * the value it corrects, since that is the only thing it touches.
 */
@ApiTags('Laboratory Results')
@RequireFeature('laboratory')
@Controller({ version: '1' })
export class LabResultController {
  constructor(private readonly labResultService: LabResultService) {}

  @Get('lab-orders/:id/results')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-result', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read the values entered on a laboratory order',
    responseDescription:
      'The order, the patient as the worklist identifies them (name, MRN, sex, age — nothing clinical), and every value typed so far whether or not it has been released (P18-T08). The bench works from this: the entry form shows what a colleague already saved, and the validation screen shows what it is about to sign out. Under `lab-order.read:own` the reader must attend the patient or be the patient.',
    responseExample: { data: LABORATORY_EXAMPLES.labResult.bench },
    notFoundDescription: 'Lab order not found.',
  })
  async getOrderBench(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labResultService.getOrderBench(id, this.assertAuthenticated(currentUser)),
    };
  }

  @Put('lab-orders/:id/results')
  @Auth([{ action: 'write', subject: 'LabResult' }])
  @Audited({ resource: 'lab-result', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Enter results for a laboratory order',
    responseDescription:
      'Saves a worksheet against the order. Each value is flagged on the way in, against the reference band that applied to this patient’s sex and age **at collection** — snapshotted onto the row, so a later catalog edit never re-flags it. A value with no applicable band is recorded unflagged rather than judged against a range meant for somebody else. A critical value notifies the ordering doctor immediately, before anybody verifies it. Saving again re-states the same values; versioning begins only once the order is released.',
    responseExample: {
      data: {
        order: { ...LABORATORY_EXAMPLES.labOrder.view, status: 'RESULTED' },
        results: [LABORATORY_EXAMPLES.labResult.view],
      },
      message: 'Lab results saved',
    },
    requestType: EnterLabResultsDto,
    requestExample: LABORATORY_EXAMPLES.labResult.enterRequest,
    notFoundDescription: 'Lab order not found, or that test is not on this order.',
  })
  async enterLabResults(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: EnterLabResultsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labResultService.enterLabResults(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Lab results saved',
    };
  }

  @Post('lab-orders/:id/release')
  @HttpCode(200)
  @Auth([{ action: 'verify', subject: 'LabResult' }])
  @Audited({ resource: 'lab-result', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Release a laboratory order',
    responseDescription:
      'The second signature, applied to the whole order — a report is signed out as one document. Refused while any test is still waiting for a value, and refused when the verifier is the person who entered it unless this clinic has `singleOperator` on; every released row records which of the two it was. A LAB_TECHNICIAN may release only where `technicianMayVerify` is on. Releasing notifies the ordering doctor.',
    responseExample: {
      data: {
        order: { ...LABORATORY_EXAMPLES.labOrder.view, status: 'RELEASED' },
        results: [LABORATORY_EXAMPLES.labResult.released],
      },
      message: 'Lab order released',
    },
    notFoundDescription: 'Lab order not found.',
  })
  async releaseLabOrder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labResultService.releaseLabOrder(
        id,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Lab order released',
    };
  }

  @Post('lab-results/:id/amend')
  @HttpCode(200)
  @Auth([{ action: 'verify', subject: 'LabResult' }])
  @Audited({ resource: 'lab-result', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Amend a released laboratory result',
    responseDescription:
      'Writes the correction as the next version beside the value it replaces; the superseded row stays readable for ever, because somebody may have treated a patient on the strength of it. The order is released again with a new timestamp and the ordering doctor is told. Only the current version of a value can be amended, and the reason is mandatory — it is what the amended report shows the person who acted on the old number.',
    responseExample: { data: LABORATORY_EXAMPLES.labResult.amended, message: 'Lab result amended' },
    requestType: AmendLabResultDto,
    requestExample: LABORATORY_EXAMPLES.labResult.amendRequest,
    notFoundDescription: 'Lab result not found.',
  })
  async amendLabResult(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: AmendLabResultDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labResultService.amendLabResult(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Lab result amended',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
