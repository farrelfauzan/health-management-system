import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { EncounterClinicalDataService } from '../service/encounter-clinical-data.service';

/**
 * A patient's immunisation history (`P10-T16`).
 *
 * On the patient rather than on an encounter, because that is the question
 * being asked: "what has this person had, and when" spans every visit they
 * ever made, and the answer decides whether the next dose is due.
 */
@ApiTags('Encounters')
@Controller({ version: '1', path: 'patients/:patientId' })
export class PatientImmunizationController {
  constructor(private readonly encounterClinicalDataService: EncounterClinicalDataService) {}

  @Get('immunizations')
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: "Read a patient's immunisation history",
    responseDescription: 'Every recorded vaccination, most recent first.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.encounter.immunization] },
  })
  async listPatientImmunizations(@Param('patientId', new ParseUUIDPipe()) patientId: string) {
    return { data: await this.encounterClinicalDataService.listPatientImmunizations(patientId) };
  }
}
