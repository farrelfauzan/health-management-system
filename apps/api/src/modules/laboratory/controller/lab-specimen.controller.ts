import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CollectLabSpecimensDto } from '../dto/collect-lab-specimens.dto';
import { RejectLabSpecimenDto } from '../dto/reject-lab-specimen.dto';
import { LabSpecimenService } from '../service/lab-specimen.service';

/** The bench's own routes: draw, receive, reject, and print a label. */
@ApiTags('Laboratory Specimens')
@RequireFeature('laboratory')
@Controller({ version: '1' })
export class LabSpecimenController {
  constructor(private readonly labSpecimenService: LabSpecimenService) {}

  @Post('lab-orders/:id/collect')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'LabSpecimen' }])
  @Audited({ resource: 'lab-specimen', action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Collect the specimens an order needs',
    responseDescription:
      'One specimen per distinct specimen type among the items still waiting for one — a single EDTA tube serves the whole darah rutin — each with its own accession number, and the order moves to COLLECTED. With `LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION` on, an unsettled umum visit is refused with `LAB_PAYMENT_REQUIRED`; BPJS payers collect freely.',
    responseExample: {
      data: [LABORATORY_EXAMPLES.labSpecimen.view],
      message: 'Specimens collected',
    },
    requestType: CollectLabSpecimensDto,
    requestExample: LABORATORY_EXAMPLES.labSpecimen.collectRequest,
    successStatus: 201,
    notFoundDescription: 'Lab order not found.',
  })
  async collectLabSpecimens(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: CollectLabSpecimensDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labSpecimenService.collectLabSpecimens(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Specimens collected',
    };
  }

  @Post('lab-specimens/:id/receive')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'LabSpecimen' }])
  @Audited({ resource: 'lab-specimen', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Mark a specimen as arrived in the lab',
    responseDescription:
      'Optional step: a clinic that draws and analyses in one room never calls it, and the order moves on regardless.',
    responseExample: {
      data: { ...LABORATORY_EXAMPLES.labSpecimen.view, status: 'RECEIVED' },
      message: 'Specimen received',
    },
    notFoundDescription: 'Lab specimen not found.',
  })
  async receiveLabSpecimen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labSpecimenService.receiveLabSpecimen(
        id,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Specimen received',
    };
  }

  @Post('lab-specimens/:id/reject')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'LabSpecimen' }])
  @Audited({ resource: 'lab-specimen', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Reject a specimen and ask for a fresh draw',
    responseDescription:
      'The tube is discarded with its reason, its items return to PENDING, and the order reappears in *to-collect* with the recollect counter bumped. The rejected row is kept: the patient sat through that needle.',
    responseExample: {
      data: { ...LABORATORY_EXAMPLES.labSpecimen.view, status: 'REJECTED' },
      message: 'Specimen rejected',
    },
    requestType: RejectLabSpecimenDto,
    requestExample: LABORATORY_EXAMPLES.labSpecimen.rejectRequest,
    notFoundDescription: 'Lab specimen not found.',
  })
  async rejectLabSpecimen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RejectLabSpecimenDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.labSpecimenService.rejectLabSpecimen(
        id,
        payload,
        this.assertAuthenticated(currentUser),
      ),
      message: 'Specimen rejected',
    };
  }

  @Get('lab-specimens/:id/label')
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-specimen-label', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read a specimen label payload',
    responseDescription:
      'Values, never layout: printing is a browser print of a 50×25 mm CSS page (P18-T08) and no printer is integrated.',
    responseExample: { data: LABORATORY_EXAMPLES.labSpecimen.label },
    notFoundDescription: 'Lab specimen not found.',
  })
  async getSpecimenLabel(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.labSpecimenService.getSpecimenLabel(id) };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
