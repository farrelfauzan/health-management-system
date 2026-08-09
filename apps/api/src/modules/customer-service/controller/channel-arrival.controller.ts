import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { CUSTOMER_SERVICE_ADMIN_EXAMPLES } from '../../../common/openapi/customer-service-admin-examples';
import { ListChannelArrivalsQueryDto } from '../dto/list-channel-arrivals-query.dto';
import { ListChannelMergeCandidatesQueryDto } from '../dto/list-channel-merge-candidates-query.dto';
import { MergeChannelDraftPatientDto } from '../dto/merge-channel-draft-patient.dto';
import { ChannelArrivalService } from '../service/channel-arrival.service';

/**
 * The check-in desk's view of chat bookings (`PCS-T08`, strategy §5.2).
 *
 * A route of its own rather than a filter on `/admin/appointments`, because the
 * two answer different questions with different permissions: that screen lists
 * the day's bookings, and this one lists the records a human still has to
 * complete. Folding them together would put the worklist behind an appointment
 * grant and hide it from the person who works it.
 *
 * Reading requires both `Appointment` and `Patient` reads — the row is a
 * booking joined to a record's emptiness, and a caller holding only one of the
 * two grants should not receive the other half.
 */
@ApiTags('Customer Service')
@Controller({
  version: '1',
  path: 'admin/channel-arrivals',
})
export class ChannelArrivalController {
  constructor(private readonly channelArrivalService: ChannelArrivalService) {}

  @Get()
  @Auth([
    { action: 'read', subject: 'Appointment' },
    { action: 'read', subject: 'Patient' },
  ])
  @ApiEndpoint({
    summary: 'List channel-sourced bookings for the check-in desk',
    responseDescription:
      'Bookings made from WhatsApp/Telegram in the window, soonest first, defaulting to the clinic’s today in CLINIC_TIMEZONE. `patientIsDraft` marks the rows that need work: a chat-created record still missing a date of birth or an address. `missingFields` also reports absent identifiers so the desk knows to ask for them, but their absence alone does not keep a row on the worklist — a patient may genuinely have no BPJS coverage, and a list that never clears is a list nobody reads. No identifier value appears here, only whether one exists.',
    responseExample: {
      data: [CUSTOMER_SERVICE_ADMIN_EXAMPLES.arrival],
      meta: { nextCursor: null },
    },
  })
  async listArrivals(
    @Query() query: ListChannelArrivalsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const result = await this.channelArrivalService.listArrivals(query);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Get('merge-candidates')
  @Auth([{ action: 'merge', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Find the records a chat-created draft could be merged into',
    responseDescription:
      'Active front-desk patients matching the search, capped and ordered by name. Drafts are excluded by the query: merging one incomplete record into another clears nothing and costs an MRN. The five fields are what a person at a counter checks against the card in the patient’s hand — a name alone is not enough to merge on. No identifier value is returned; confirming a NIK is the patient-edit screen’s job, behind its own audited grant.',
    responseExample: { data: [CUSTOMER_SERVICE_ADMIN_EXAMPLES.mergeCandidate] },
  })
  async listMergeCandidates(
    @Query() query: ListChannelMergeCandidatesQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const items = await this.channelArrivalService.listMergeCandidates(query);

    return { data: items };
  }

  @Post('patients/:draftPatientId/merge')
  @HttpCode(200)
  @Auth([{ action: 'merge', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Merge a chat-created draft into an existing patient',
    responseDescription:
      'Moves the draft’s appointments, registrations, and channel links onto the existing record in one transaction, then retires the draft with a soft delete — never a hard one, because its MRN was quoted to a customer and its deferred privacy-notice record is legal evidence about a real person. Returns 400 when the draft is not a CHANNEL_BOOKING record, when the target is itself a draft or the same record, or when the draft has already acquired encounters, prescriptions, or invoices: moving clinical history between patients is not a front-desk button.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.merge,
      message: 'Draft patient merged',
    },
    requestType: MergeChannelDraftPatientDto,
    requestExample: CUSTOMER_SERVICE_ADMIN_EXAMPLES.mergeRequest,
    notFoundDescription: 'Draft or target patient not found.',
  })
  async mergeDraftPatient(
    @Param('draftPatientId', new ParseUUIDPipe()) draftPatientId: string,
    @Body() body: MergeChannelDraftPatientDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.channelArrivalService.mergeDraftPatient(draftPatientId, body, actor);

    return { data: view, message: 'Draft patient merged' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
