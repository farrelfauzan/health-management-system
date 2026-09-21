import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SHK_SCREENING_EXAMPLES } from '../../../common/openapi/shk-screening-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ListShkScreeningsQueryDto } from '../dto/list-shk-screenings-query.dto';
import { RecordShkResultDto } from '../dto/record-shk-result.dto';
import { RecordShkSampleDto } from '../dto/record-shk-sample.dto';
import { RecordShkSentDto } from '../dto/record-shk-sent.dto';
import { ShkScreeningService } from '../service/shk-screening.service';

/**
 * SHK screening (P25-T10): the due-sample worklist and the three steps of one
 * sample. Authorised on the `Encounter` subject like the birth it follows.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1', path: 'shk-screenings' })
export class ShkScreeningController {
  constructor(private readonly shkScreeningService: ShkScreeningService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'shk-screening', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List the SHK sample worklist',
    responseDescription:
      'Open samples, soonest deadline first. `status` filters to DUE (inside the 48–72 h window), OVERDUE (past it, not taken), AWAITING_RESULT (taken, no answer) or RECALL (a repeat sample not yet resulted); without it every unresulted sample is listed. Under OWN scope only babies the caller delivered or is assigned to.',
    responseExample: { data: [SHK_SCREENING_EXAMPLES.screening] },
  })
  async listWorklist(
    @Query() query: ListShkScreeningsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.shkScreeningService.listWorklist(query, this.requireUser(currentUser)),
    };
  }

  @Post(':id/sample')
  @HttpCode(HttpStatus.OK)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Record the heel prick',
    responseDescription:
      'Records when the sample was taken. An overdue sample is recorded, never refused. 409 SHK_SAMPLE_ALREADY_TAKEN when it already was; 422 SHK_TIME_OUT_OF_ORDER for a time before the birth.',
    requestType: RecordShkSampleDto,
    requestExample: SHK_SCREENING_EXAMPLES.sampleRequest,
    responseExample: { data: SHK_SCREENING_EXAMPLES.taken, message: 'SHK sample recorded' },
    notFoundDescription: 'SHK screening not found.',
  })
  async recordSample(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordShkSampleDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.shkScreeningService.recordSample(id, payload, this.requireUser(currentUser)),
      message: 'SHK sample recorded',
    };
  }

  @Post(':id/sent')
  @HttpCode(HttpStatus.OK)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Record the card sent to the laboratory',
    responseDescription:
      '422 SHK_SAMPLE_NOT_TAKEN before the heel prick is recorded; 409 SHK_SAMPLE_ALREADY_SENT when it was already sent or resulted.',
    requestType: RecordShkSentDto,
    requestExample: SHK_SCREENING_EXAMPLES.sentRequest,
    responseExample: {
      data: {
        ...SHK_SCREENING_EXAMPLES.taken,
        status: 'SENT',
        ...SHK_SCREENING_EXAMPLES.sentRequest,
      },
      message: 'SHK sample sent',
    },
    notFoundDescription: 'SHK screening not found.',
  })
  async recordSent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordShkSentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.shkScreeningService.recordSent(id, payload, this.requireUser(currentUser)),
      message: 'SHK sample sent',
    };
  }

  @Post(':id/result')
  @HttpCode(HttpStatus.OK)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: "Record the laboratory's answer",
    responseDescription:
      'RECALL or INVALID_SAMPLE opens the next sample, due at once, and notifies the attendant and every clinician with one SHK_RECALL each. 422 SHK_SAMPLE_NOT_TAKEN before the heel prick; 409 SHK_RESULT_ALREADY_RECORDED when answered already.',
    requestType: RecordShkResultDto,
    requestExample: SHK_SCREENING_EXAMPLES.resultRequest,
    responseExample: {
      data: {
        ...SHK_SCREENING_EXAMPLES.taken,
        status: 'RESULTED',
        resultReceivedAt: SHK_SCREENING_EXAMPLES.resultRequest.receivedAt,
        result: SHK_SCREENING_EXAMPLES.resultRequest.result,
        notes: SHK_SCREENING_EXAMPLES.resultRequest.notes,
      },
      message: 'SHK result recorded',
    },
    notFoundDescription: 'SHK screening not found.',
  })
  async recordResult(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordShkResultDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.shkScreeningService.recordResult(id, payload, this.requireUser(currentUser)),
      message: 'SHK result recorded',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
