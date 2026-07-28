import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { AddDiagnosisDto } from '../dto/add-diagnosis.dto';
import { AddProcedureDto } from '../dto/add-procedure.dto';
import { RecordVitalSignsDto } from '../dto/record-vital-signs.dto';
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

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return currentUser;
  }
}
