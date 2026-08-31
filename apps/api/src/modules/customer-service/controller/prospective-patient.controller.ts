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
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ConvertProspectivePatientDto } from '../dto/convert-prospective-patient.dto';
import { LinkProspectivePatientDto } from '../dto/link-prospective-patient.dto';
import { ListProspectiveMatchCandidatesQueryDto } from '../dto/list-prospective-match-candidates-query.dto';
import { ListProspectivePatientsQueryDto } from '../dto/list-prospective-patients-query.dto';
import { ProspectiveArrivalService } from '../service/prospective-arrival.service';

/**
 * Arrival conversion: the counter turning an enquiry into a patient
 * (`P17-T04`, strategy §5.2).
 *
 * Four routes in a deliberate order — list, search, then one of two
 * resolutions — and the middle one is not optional. Searching before creating
 * is what stops a returning patient who booked from a new phone becoming a
 * second permanent record, and it is enforced twice: the front end will not
 * enable *create new* until the search has run, and the two resolutions carry
 * different permissions so that "link" can never be reached by a caller who
 * only holds "create".
 *
 * **Not behind `RequireFeature('cs-channels')`, unlike the arrival worklist.**
 * The worklist is a view of a live channel; these routes resolve people who
 * already booked. A clinic that switches the channel off still has them
 * walking in, and gating this would strand their appointments on records
 * nothing could convert.
 */
@ApiTags('Customer Service')
@Controller({
  version: '1',
  path: 'prospective-patients',
})
export class ProspectivePatientController {
  constructor(private readonly prospectiveArrivalService: ProspectiveArrivalService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'List people who booked through a channel and have not been registered',
    responseDescription:
      'Prospective records in the requested status, oldest enquiry first — a worklist, so the record closest to expiring unresolved leads it. Defaults to AWAITING_ARRIVAL. No MRN and no clinical field appears here because none exists yet; `openAppointments` counts what is still riding on the record, so a row whose only booking was cancelled reads as nothing to do.',
    responseExample: { data: [CUSTOMER_SERVICE_ADMIN_EXAMPLES.prospectivePatient] },
  })
  async listProspectivePatients(
    @Query() query: ListProspectivePatientsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const items = await this.prospectiveArrivalService.listProspectivePatients(query);

    return { data: items };
  }

  @Get(':prospectivePatientId/match-candidates')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Search the registry before spending an MRN on this person',
    responseDescription:
      'Registry records the arriving person might already be, strongest evidence first. With no query it seeds from the booking’s own name and phone number; `search` is the name the person actually gave, and `nik` is the exact lookup from the ID document. `reasons` is what the clerk acts on — an exact NIK outranks a registered number, which outranks a similar name, because a phone is a household object and two people called Siti is the ordinary case. `nik` is hashed to its blind index and compared; it is never echoed back, and only the last four digits of a stored NIK are ever returned.',
    responseExample: { data: [CUSTOMER_SERVICE_ADMIN_EXAMPLES.prospectiveMatchCandidate] },
    notFoundDescription: 'Prospective patient not found.',
  })
  async listMatchCandidates(
    @Param('prospectivePatientId', new ParseUUIDPipe()) prospectivePatientId: string,
    @Query() query: ListProspectiveMatchCandidatesQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const items = await this.prospectiveArrivalService.listMatchCandidates(
      prospectivePatientId,
      query,
    );

    return { data: items };
  }

  @Post(':prospectivePatientId/link')
  @HttpCode(200)
  @Auth([{ action: 'update', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'The arriving person is already a patient — point the booking at their record',
    responseDescription:
      'Repoints the booking onto the existing record and marks the enquiry LINKED, in one transaction. **No MRN is allocated**, which is the whole difference between this route and convert. Returns 400 when the enquiry has already been resolved or expired — a second click on a stale screen must not resolve it twice — or when the target record is deactivated.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.prospectiveLink,
      message: 'Booking linked to the existing patient',
    },
    requestType: LinkProspectivePatientDto,
    requestExample: CUSTOMER_SERVICE_ADMIN_EXAMPLES.prospectiveLinkRequest,
    notFoundDescription: 'Prospective patient or target patient not found.',
  })
  async linkToExistingPatient(
    @Param('prospectivePatientId', new ParseUUIDPipe()) prospectivePatientId: string,
    @Body() body: LinkProspectivePatientDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.prospectiveArrivalService.linkToExistingPatient(
      prospectivePatientId,
      body,
      actor,
    );

    return { data: view, message: 'Booking linked to the existing patient' };
  }

  @Post(':prospectivePatientId/convert')
  @HttpCode(201)
  @Auth([{ action: 'create', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'The arriving person is new — register them and allocate their MRN',
    responseDescription:
      '**The one route in the system where arriving at the clinic allocates an MRN.** Takes the ordinary patient-create payload, so the same required demographics, identifier validation, privacy-notice evidence and encryption path apply — a conversion produces an ordinary registry record, not a special one. The create, the MRN allocation, the appointment repoint and the CONVERTED mark are one transaction: a failure anywhere rolls the number back rather than burning it. Returns 400 when the enquiry has already been resolved.',
    responseExample: {
      data: CUSTOMER_SERVICE_ADMIN_EXAMPLES.prospectiveConversion,
      // Same shape the ordinary create returns: a NIK that disagrees with the
      // typed birth date or sex is flagged, never rejected.
      meta: { identifierWarnings: [] },
      message: 'Patient registered from the booking',
    },
    requestType: ConvertProspectivePatientDto,
    requestExample: PHASE_THREE_EXAMPLES.patient.createRequest,
    notFoundDescription: 'Prospective patient not found.',
    successStatus: 201,
  })
  async convertToNewPatient(
    @Param('prospectivePatientId', new ParseUUIDPipe()) prospectivePatientId: string,
    @Body() body: ConvertProspectivePatientDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const { identifierWarnings, ...view } = await this.prospectiveArrivalService.convertToNewPatient(
      prospectivePatientId,
      body,
      actor,
    );

    return {
      data: view,
      meta: { identifierWarnings },
      message: 'Patient registered from the booking',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
