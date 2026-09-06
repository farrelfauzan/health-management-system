import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuditAction } from '../../../generated/prisma/client';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AddDiagnosisDto } from '../dto/add-diagnosis.dto';
import { AddImmunizationDto } from '../dto/add-immunization.dto';
import { AddProcedureDto } from '../dto/add-procedure.dto';
import { RecordVitalSignsDto } from '../dto/record-vital-signs.dto';
import { UpsertBpjsReferralDto } from '../dto/upsert-bpjs-referral.dto';
import { EncounterClinicalDataService } from '../service/encounter-clinical-data.service';

/**
 * The measured and coded content of an encounter, kept on its own routes
 * because each entry is appended and retracted independently of the record it
 * belongs to.
 */
@ApiTags('Encounters')
@Controller({
  version: '1',
  path: 'encounters/:encounterId',
})
export class EncounterClinicalDataController {
  constructor(private readonly encounterClinicalDataService: EncounterClinicalDataService) {}

  @Post('vital-signs')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-vital-signs',
    action: AuditAction.CREATE,
    idParam: 'encounterId',
  })
  @ApiEndpoint({
    summary: 'Record a vital-signs measurement',
    responseDescription:
      'A new measurement set was appended. Existing sets are never overwritten, so a recheck keeps the reading that prompted it. BMI is derived, not stored.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.vitalSigns,
      message: 'Vital signs recorded',
    },
    requestType: RecordVitalSignsDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.vitalSignsRequest,
    successStatus: 201,
    notFoundDescription: 'Encounter not found.',
  })
  async recordVitalSigns(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: RecordVitalSignsDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const vitalSigns = await this.encounterClinicalDataService.recordVitalSigns(
      encounterId,
      payload,
      actor,
    );

    return {
      data: vitalSigns,
      message: 'Vital signs recorded',
    };
  }

  @Post('diagnoses')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'encounter-diagnosis', action: AuditAction.CREATE, idParam: 'encounterId' })
  @ApiEndpoint({
    summary: 'Code a diagnosis',
    responseDescription:
      'The diagnosis was recorded. Naming an ICD-10 catalog row snapshots its code and title from the catalog; a code the catalog does not carry is supplied as code plus display.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.diagnosis,
      message: 'Diagnosis recorded',
    },
    requestType: AddDiagnosisDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.diagnosisRequest,
    successStatus: 201,
    notFoundDescription: 'Encounter not found.',
  })
  async addDiagnosis(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: AddDiagnosisDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const diagnosis = await this.encounterClinicalDataService.addDiagnosis(
      encounterId,
      payload,
      actor,
    );

    return {
      data: diagnosis,
      message: 'Diagnosis recorded',
    };
  }

  @Delete('diagnoses/:diagnosisId')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'encounter-diagnosis', action: AuditAction.DELETE, idParam: 'diagnosisId' })
  @ApiEndpoint({
    summary: 'Retract a diagnosis',
    responseDescription:
      'The diagnosis is soft-deleted: it stays auditable while releasing the code and the PRIMARY slot so a correction can be recorded.',
    responseExample: { message: 'Diagnosis retracted' },
    notFoundDescription: 'Diagnosis not found on this encounter.',
  })
  async removeDiagnosis(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Param('diagnosisId', new ParseUUIDPipe()) diagnosisId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    await this.encounterClinicalDataService.removeDiagnosis(encounterId, diagnosisId, actor);

    return {
      message: 'Diagnosis retracted',
    };
  }

  @Post('procedures')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'encounter-procedure', action: AuditAction.CREATE, idParam: 'encounterId' })
  @ApiEndpoint({
    summary: 'Code a procedure',
    responseDescription:
      'The ICD-9-CM procedure was recorded against the encounter. BPJS prices a claim from these rows, so an uncoded action is an unbillable one.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.procedure,
      message: 'Procedure recorded',
    },
    requestType: AddProcedureDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.procedureRequest,
    successStatus: 201,
    notFoundDescription: 'Encounter not found.',
  })
  async addProcedure(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: AddProcedureDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const procedure = await this.encounterClinicalDataService.addProcedure(
      encounterId,
      payload,
      actor,
    );

    return {
      data: procedure,
      message: 'Procedure recorded',
    };
  }

  @Delete('procedures/:procedureId')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'encounter-procedure', action: AuditAction.DELETE, idParam: 'procedureId' })
  @ApiEndpoint({
    summary: 'Retract a procedure',
    responseDescription: 'The procedure is soft-deleted and stays auditable.',
    responseExample: { message: 'Procedure retracted' },
    notFoundDescription: 'Procedure not found on this encounter.',
  })
  async removeProcedure(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Param('procedureId', new ParseUUIDPipe()) procedureId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    await this.encounterClinicalDataService.removeProcedure(encounterId, procedureId, actor);

    return {
      message: 'Procedure retracted',
    };
  }

  @Post('immunizations')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-immunization',
    action: AuditAction.CREATE,
    idParam: 'encounterId',
  })
  @ApiEndpoint({
    summary: 'Record a vaccination',
    responseDescription:
      'The vaccination was recorded against the encounter. Only a catalog row flagged as a vaccine may be named; one without a KFA code is recorded locally and skipped in the SATUSEHAT bundle.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.encounter.immunization,
      message: 'Immunization recorded',
    },
    requestType: AddImmunizationDto,
    requestExample: PHASE_THREE_EXAMPLES.encounter.immunizationRequest,
    successStatus: 201,
    notFoundDescription: 'Encounter not found.',
  })
  async addImmunization(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: AddImmunizationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const immunization = await this.encounterClinicalDataService.addImmunization(
      encounterId,
      payload,
      actor,
    );

    return {
      data: immunization,
      message: 'Immunization recorded',
    };
  }

  @Delete('immunizations/:immunizationId')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-immunization',
    action: AuditAction.DELETE,
    idParam: 'immunizationId',
  })
  @ApiEndpoint({
    summary: 'Retract a vaccination',
    responseDescription: 'The immunisation is soft-deleted and stays auditable.',
    responseExample: { message: 'Immunization retracted' },
    notFoundDescription: 'Immunization not found on this encounter.',
  })
  async removeImmunization(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Param('immunizationId', new ParseUUIDPipe()) immunizationId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    await this.encounterClinicalDataService.removeImmunization(
      encounterId,
      immunizationId,
      actor,
    );

    return {
      message: 'Immunization retracted',
    };
  }

  @Put('bpjs-referral')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-bpjs-referral',
    action: AuditAction.UPDATE,
    idParam: 'encounterId',
  })
  @ApiEndpoint({
    summary: 'Record or replace the encounter’s BPJS rujukan',
    responseDescription:
      'The recorded referral. One per encounter — PCare carries the rujukan on the kunjungan payload at close, so the last decision recorded before close is what gets reported. Provide subSpecialtyCode (subspesialis referral) or khususCode (khusus/TACC).',
    responseExample: {
      data: BPJS_PCARE_EXAMPLES.referral,
      message: 'BPJS referral recorded',
    },
    requestType: UpsertBpjsReferralDto,
    requestExample: BPJS_PCARE_EXAMPLES.referralRequest,
    notFoundDescription: 'Encounter not found.',
  })
  async saveBpjsReferral(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: UpsertBpjsReferralDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const referral = await this.encounterClinicalDataService.saveBpjsReferral(
      encounterId,
      payload,
      actor,
    );

    return {
      data: referral,
      message: 'BPJS referral recorded',
    };
  }

  @Get('bpjs-referral')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-bpjs-referral',
    action: AuditAction.READ,
    idParam: 'encounterId',
  })
  @ApiEndpoint({
    summary: 'Read the encounter’s recorded BPJS rujukan',
    responseDescription: 'The referral recorded on this encounter, if any.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.referral },
    notFoundDescription: 'Encounter not found, or no referral recorded.',
  })
  async getBpjsReferral(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const referral = await this.encounterClinicalDataService.getBpjsReferral(encounterId, actor);

    return { data: referral };
  }

  @Delete('bpjs-referral')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({
    resource: 'encounter-bpjs-referral',
    action: AuditAction.DELETE,
    idParam: 'encounterId',
  })
  @ApiEndpoint({
    summary: 'Retract the encounter’s BPJS rujukan',
    responseDescription:
      'The referral is soft-deleted and stays auditable; the kunjungan will report a normal outpatient discharge.',
    responseExample: { message: 'BPJS referral retracted' },
    notFoundDescription: 'Encounter not found, or no referral recorded.',
  })
  async removeBpjsReferral(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    await this.encounterClinicalDataService.removeBpjsReferral(encounterId, actor);

    return {
      message: 'BPJS referral retracted',
    };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
