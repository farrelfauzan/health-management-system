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
import { POSTNATAL_CARE_EXAMPLES } from '../../../common/openapi/postnatal-care-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { LinkPostnatalVisitDto } from '../dto/link-postnatal-visit.dto';
import { UpsertPostnatalExaminationDto } from '../dto/upsert-postnatal-examination.dto';
import { PostnatalVisitService } from '../service/postnatal-visit.service';

/**
 * Nifas and neonatal visits after a birth (P25-T12). Authorised on the
 * `Encounter` subject like the rest of maternal care (P25-T06), so no
 * permission key is seeded.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1' })
export class PostnatalVisitController {
  constructor(private readonly postnatalVisitService: PostnatalVisitService) {}

  @Get('pregnancy-episodes/:id/postnatal-schedule')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'postnatal-schedule', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read the nifas and neonatal schedule of a birth',
    responseDescription:
      'The seven windows — KF1–KF4 for the mother, KN1–KN3 for the baby — with their bounds and whether each is FULFILLED, DUE, UPCOMING or MISSED, and the encounter that fulfilled it. Hour bounds count from the birth; day bounds are whole clinic-local days with the birth date as day 0.',
    responseExample: { data: POSTNATAL_CARE_EXAMPLES.schedule },
    notFoundDescription: 'No birth is recorded for this pregnancy episode.',
  })
  async getSchedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.postnatalVisitService.getSchedule(id, this.requireUser(currentUser)),
    };
  }

  @Get('encounters/:encounterId/postnatal-visit')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'postnatal-visit', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: "Read this encounter's nifas or neonatal visit",
    responseDescription:
      'The visit with its KF/KN code and, for a nifas visit, the examination. `visitCode` null means the visit fell outside every window. `data` is null when the encounter is not counted as a postnatal visit.',
    responseExample: { data: POSTNATAL_CARE_EXAMPLES.visit },
    notFoundDescription: 'Encounter not found.',
  })
  async getEncounterVisit(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.postnatalVisitService.getEncounterVisit(
        encounterId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Post('encounters/:encounterId/postnatal-visit')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'postnatal-visit', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Count this encounter as a nifas or neonatal visit',
    responseDescription:
      "MOTHER links the encounter to the patient's most recent birth; NEWBORN to the baby whose patient record the encounter is on. The code is derived from the encounter's start and frozen when it closes. 409 POSTNATAL_VISIT_ALREADY_LINKED / ENCOUNTER_IS_ANTENATAL_VISIT; 422 POSTNATAL_BIRTH_NOT_FOUND, POSTNATAL_NEWBORN_NOT_FOUND or POSTNATAL_VISIT_BEFORE_BIRTH.",
    requestType: LinkPostnatalVisitDto,
    requestExample: POSTNATAL_CARE_EXAMPLES.linkRequest,
    responseExample: {
      data: POSTNATAL_CARE_EXAMPLES.visit,
      message: 'Encounter counted as a postnatal visit',
    },
    notFoundDescription: 'Encounter not found.',
  })
  async linkVisit(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: LinkPostnatalVisitDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.postnatalVisitService.linkVisit(
        encounterId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Encounter counted as a postnatal visit',
    };
  }

  @Put('encounters/:encounterId/postnatal-examination')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'postnatal-examination', action: AuditAction.UPDATE, idParam: null })
  @ApiEndpoint({
    summary: "Record this nifas visit's examination",
    responseDescription:
      'Upsert — one examination per visit. Every field is optional. Blood pressure, pulse, temperature and respiration are not accepted here; they come from the vitals. 409 POSTNATAL_VISIT_REQUIRED before the visit is linked; 422 POSTNATAL_EXAMINATION_MOTHER_ONLY on a neonatal visit.',
    requestType: UpsertPostnatalExaminationDto,
    requestExample: POSTNATAL_CARE_EXAMPLES.examinationRequest,
    responseExample: {
      data: POSTNATAL_CARE_EXAMPLES.visit,
      message: 'Postnatal examination saved',
    },
    notFoundDescription: 'Encounter not found.',
  })
  async upsertExamination(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: UpsertPostnatalExaminationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.postnatalVisitService.upsertExamination(
        encounterId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Postnatal examination saved',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
