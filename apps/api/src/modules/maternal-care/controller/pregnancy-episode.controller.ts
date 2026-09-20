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

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MATERNAL_CARE_EXAMPLES } from '../../../common/openapi/maternal-care-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreatePregnancyEpisodeDto } from '../dto/create-pregnancy-episode.dto';
import { EndPregnancyEpisodeDto } from '../dto/end-pregnancy-episode.dto';
import { RecordExternalDoctorVisitDto } from '../dto/record-external-doctor-visit.dto';
import { UpdatePregnancyEpisodeDto } from '../dto/update-pregnancy-episode.dto';
import { MaternalCareService } from '../service/maternal-care.service';

/**
 * The pregnancy episode (P25-T06). Authorised on the `Encounter` subject, not
 * on a subject of its own: an episode is a view over the encounters that make
 * it up, so whoever may read or write those may read or write this.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1' })
export class PregnancyEpisodeController {
  constructor(private readonly maternalCareService: MaternalCareService) {}

  @Post('patients/:patientId/pregnancy-episodes')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'pregnancy-episode',
    action: AuditAction.CREATE,
    idParam: null,
    patientIdParam: 'patientId',
  })
  @ApiEndpoint({
    summary: 'Open a pregnancy episode',
    responseDescription:
      'The episode was opened. 422 PREGNANCY_EPISODE_PATIENT_NOT_FEMALE for a patient who is not female, and 409 PREGNANCY_EPISODE_ALREADY_ACTIVE when she already has one — including when two tabs race, which the partial unique index settles.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.episode, message: 'Pregnancy episode opened' },
    requestType: CreatePregnancyEpisodeDto,
    notFoundDescription: 'Patient not found.',
  })
  async createEpisode(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Body() payload: CreatePregnancyEpisodeDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.createEpisode(
        patientId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Pregnancy episode opened',
    };
  }

  @Get('patients/:patientId/pregnancy-episodes')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.READ, idParam: null, patientIdParam: 'patientId' })
  @ApiEndpoint({
    summary: "List a patient's pregnancy episodes",
    responseDescription: 'Every episode she has had, newest first.',
    responseExample: { data: [MATERNAL_CARE_EXAMPLES.episode] },
  })
  async listEpisodes(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.listEpisodes(patientId, this.requireUser(currentUser)),
    };
  }

  @Get('patients/:patientId/pregnancy-episodes/active')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.READ, idParam: null, patientIdParam: 'patientId' })
  @ApiEndpoint({
    summary: 'Get the active pregnancy episode',
    responseDescription:
      'The episode with its numbered visits, how far along she is today, and what each trimester still owes. `data` is null when she has no active episode — not pregnant is an ordinary answer, not a 404.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.activeEpisode },
  })
  async getActiveEpisode(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.getActiveEpisode(
        patientId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Patch('pregnancy-episodes/:id')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Edit a pregnancy episode',
    responseDescription:
      'HPHT, HPL, GPA, blood type, rhesus and risk notes. ACTIVE episodes only — 409 otherwise. A changed HPHT renumbers the visits that are not yet closed.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.episode, message: 'Pregnancy episode updated' },
    requestType: UpdatePregnancyEpisodeDto,
    notFoundDescription: 'Pregnancy episode not found.',
  })
  async updateEpisode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdatePregnancyEpisodeDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.updateEpisode(
        id,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Pregnancy episode updated',
    };
  }

  @Post('pregnancy-episodes/:id/end')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'End a pregnancy episode',
    responseDescription:
      'Closes an episode that did not end in a birth. LOST_TO_FOLLOW_UP defaults `endedAt` to HPHT + 308 days, which is where SATUSEHAT closes the ANC period. DELIVERY is not accepted here — a delivered pregnancy is closed by the delivery record.',
    responseExample: {
      data: MATERNAL_CARE_EXAMPLES.endedEpisode,
      message: 'Pregnancy episode ended',
    },
    requestType: EndPregnancyEpisodeDto,
    notFoundDescription: 'Pregnancy episode not found.',
  })
  async endEpisode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: EndPregnancyEpisodeDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.endEpisode(id, payload, this.requireUser(currentUser)),
      message: 'Pregnancy episode ended',
    };
  }

  @Post('pregnancy-episodes/:id/external-doctor-visits')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Record a doctor visit made elsewhere',
    responseDescription:
      'A dokter or SpOG contact the mother made at another facility, read off her Buku KIA (FR-ANC-07). It counts towards the two visits Permenkes 21/2021 requires, so a klinik bidan that correctly referred her out is not marked non-compliant.',
    responseExample: {
      data: MATERNAL_CARE_EXAMPLES.externalDoctorVisit,
      message: 'Doctor visit recorded',
    },
    requestType: RecordExternalDoctorVisitDto,
    notFoundDescription: 'Pregnancy episode not found.',
  })
  async recordExternalDoctorVisit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RecordExternalDoctorVisitDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.recordExternalDoctorVisit(
        id,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Doctor visit recorded',
    };
  }

  @Get('encounters/:encounterId/antenatal-visit')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-visit', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: "Read this encounter's antenatal visit",
    responseDescription:
      'The K-code and gestational age for the encounter, or null when it is not counted as an antenatal visit.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.encounterVisit },
    notFoundDescription: 'Encounter not found.',
  })
  async getEncounterVisit(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.getEncounterVisit(
        encounterId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Post('encounters/:encounterId/antenatal-visit')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-visit', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Count this encounter as an antenatal visit',
    responseDescription:
      "Links an open encounter to the patient's active episode and answers with its K-code. 409 when it is already counted, 422 when she has no active episode.",
    responseExample: {
      data: MATERNAL_CARE_EXAMPLES.encounterVisit,
      message: 'Encounter counted as an antenatal visit',
    },
    notFoundDescription: 'Encounter not found.',
  })
  async linkEncounterVisit(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.maternalCareService.linkEncounterToActiveEpisode(
        encounterId,
        this.requireUser(currentUser),
      ),
      message: 'Encounter counted as an antenatal visit',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }

    return currentUser;
  }
}
