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

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { FAMILY_PLANNING_EXAMPLES } from '../../../common/openapi/family-planning-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { DiscontinueFamilyPlanningDto } from '../dto/discontinue-family-planning.dto';
import { ListFamilyPlanningDueQueryDto } from '../dto/list-family-planning-due-query.dto';
import { RecordFamilyPlanningServiceDto } from '../dto/record-family-planning-service.dto';
import { StartFamilyPlanningDto } from '../dto/start-family-planning.dto';
import { FamilyPlanningService } from '../service/family-planning.service';

/**
 * The family planning (KB) course (P25-T14). Authorised on the `Encounter`
 * subject and gated by the `maternal-care` feature, like the pregnancy episode
 * (P25-T06): KB is clinical work on the patient, and no key is seeded for it.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1' })
export class FamilyPlanningController {
  constructor(private readonly familyPlanningService: FamilyPlanningService) {}

  @Get('family-planning/due')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'family-planning-record', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List family planning courses due soon or overdue',
    responseDescription:
      "Live courses whose next due date is within `withinDays` (default 7) of the clinic's today, or already past it, soonest first. `daysUntilDue` is negative when overdue. Under OWN scope, only the courses she provides and the patients assigned to her.",
    responseExample: { data: [FAMILY_PLANNING_EXAMPLES.dueItem] },
  })
  async listDue(
    @Query() query: ListFamilyPlanningDueQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return { data: await this.familyPlanningService.listDue(query, this.requireUser(currentUser)) };
  }

  @Get('patients/:patientId/family-planning')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({
    resource: 'family-planning-record',
    action: AuditAction.READ,
    idParam: null,
    patientIdParam: 'patientId',
  })
  @ApiEndpoint({
    summary: "Read a patient's family planning record",
    responseDescription:
      'The live course (or null), every course newest first, and — when she has no live course — her most recent birth of the last 42 days that no course links to yet, offered as KB pasca salin.',
    responseExample: { data: FAMILY_PLANNING_EXAMPLES.patientFamilyPlanning },
    notFoundDescription: 'Patient not found.',
  })
  async getPatientFamilyPlanning(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.familyPlanningService.getPatientFamilyPlanning(
        patientId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Post('patients/:patientId/family-planning')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Start a family planning course',
    responseDescription:
      "Starts one method course. Without `nextDueOn` the method's sourced default applies (pill and 1-month injectable 28 days, 3-month injectable 84 days); a condom never has a due date and IUD/implant dates are entered by the clinician. Pass `deliveryRecordId` for KB pasca salin. 409 FAMILY_PLANNING_COURSE_ACTIVE when she already has a live course; 422 MIDWIFE_AUTHORITY_REQUIRED (`details.kind` IUD_IMPLANT) when a midwife provider starts an IUD or implant without the authority or a covering mandate.",
    requestType: StartFamilyPlanningDto,
    requestExample: FAMILY_PLANNING_EXAMPLES.startRequest,
    responseExample: { data: FAMILY_PLANNING_EXAMPLES.course, message: 'Family planning started' },
    notFoundDescription: 'Patient, provider, encounter or delivery not found.',
  })
  async startCourse(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Body() payload: StartFamilyPlanningDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.familyPlanningService.startCourse(
        patientId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Family planning started',
    };
  }

  @Post('family-planning/:id/services')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Record a family planning follow-up',
    responseDescription:
      "Records one service on a live course and moves the course's next due date to the service's — the method default from `servedOn` unless the clinician entered one. 409 FAMILY_PLANNING_COURSE_DISCONTINUED for a discontinued course.",
    requestType: RecordFamilyPlanningServiceDto,
    requestExample: FAMILY_PLANNING_EXAMPLES.serviceRequest,
    responseExample: {
      data: FAMILY_PLANNING_EXAMPLES.serviceCourse,
      message: 'Family planning service recorded',
    },
    notFoundDescription: 'Family planning course not found.',
  })
  async recordService(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordFamilyPlanningServiceDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.familyPlanningService.recordService(id, payload, this.requireUser(currentUser)),
      message: 'Family planning service recorded',
    };
  }

  @Post('family-planning/:id/discontinue')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @ApiEndpoint({
    summary: 'Discontinue a family planning course',
    responseDescription:
      'Ends the live course with a date and a reason; it leaves the due list and a new course may be started. 409 FAMILY_PLANNING_COURSE_DISCONTINUED when it already ended.',
    requestType: DiscontinueFamilyPlanningDto,
    requestExample: FAMILY_PLANNING_EXAMPLES.discontinueRequest,
    responseExample: {
      data: {
        ...FAMILY_PLANNING_EXAMPLES.course,
        discontinuedOn: '2027-03-17',
        discontinuationReason: 'WANTS_PREGNANCY',
        isLive: false,
      },
      message: 'Family planning discontinued',
    },
    notFoundDescription: 'Family planning course not found.',
  })
  async discontinueCourse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: DiscontinueFamilyPlanningDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.familyPlanningService.discontinueCourse(
        id,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Family planning discontinued',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
