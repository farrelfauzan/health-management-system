import { Injectable } from '@nestjs/common';

import {
  AI_CHAT_TOOL_LIST_PAGE_LIMIT,
  ChatChannelValue,
  ChatToolNameValue,
  ChatToolPatientListItem,
  ListMyPatientsToolResult,
  listMyPatientsToolArgsSchema,
  listMyPatientsToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { PatientManagementService } from '../../../patient-management/service/patient-management.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

/**
 * "Which patients are assigned to me?" — the first of the three patient tools
 * (P15-T06), and the first place in this programme where patient data reaches
 * a tool at all.
 *
 * **The scoping is inherited, not implemented.** This calls
 * `PatientManagementService.listPatients` with the asking doctor's own
 * `CurrentUser`, and for a `DOCTOR` the `patient.read:own` grant already
 * resolves through the `DoctorPatient` assignment table inside that service.
 * There is no filter here that could drift from the REST route's, because
 * there is no filter here at all — the tool is the same door.
 *
 * The registry additionally withholds this tool from an actor whose
 * `patient.read` resolves to `ANY` (§4.1.1 rule 2): "the patients assigned to
 * you" has no meaning for someone who can read every patient, and executing
 * it for them would silently widen the population the tool's name promises.
 */
@Injectable()
export class ListMyPatientsTool implements ChatTool {
  readonly name: ChatToolNameValue = 'list_my_patients';

  readonly description: string = [
    'The patients assigned to the asking doctor, paginated, newest first.',
    'Daftar pasien yang ditugaskan kepada dokter yang sedang bertanya.',
    'Use for: "pasien saya siapa saja", "berapa pasien saya", "list my patients", "siapa pasien yang saya tangani".',
    'Do NOT use for: jadwal atau janji temu hari ini (pakai list_my_appointments), detail satu pasien (pakai get_patient_summary), atau mencari pasien yang bukan pasien Anda.',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['DOCTOR'];

  readonly allowedRoleCodes: readonly string[] = ['DOCTOR'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Patient', action: 'read', scope: 'OWN' };

  readonly argumentSchema = listMyPatientsToolArgsSchema;

  constructor(private readonly patientManagementService: PatientManagementService) {}

  async execute(user: CurrentUser, validatedArguments: unknown): Promise<ListMyPatientsToolResult> {
    const { page } = listMyPatientsToolArgsSchema.parse(validatedArguments);
    const result = await this.patientManagementService.listPatients(
      // §7 minimisation: the page cap is part of the tool contract, so a list
      // tool can never become a bulk export however the model paginates.
      { page, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT },
      user,
    );
    return projectToolResult(listMyPatientsToolResultSchema, {
      page: result.meta.page,
      // The total, not the page length — a client must be able to say "20 of
      // 44" rather than imply the page it was handed is the whole answer.
      matchCount: result.meta.total,
      items: result.items.map((patient) => this.toListItem(patient)),
    });
  }

  /**
   * The §4.3 allowlist, copied field by field. The backing projection also
   * carries `isActive`, `doctorCount`, `allergyCount` and a `doctors[]` array
   * naming other practitioners; none is copied, so none can appear.
   */
  private toListItem(patient: {
    id: string;
    fullName: string;
    status: string;
  }): ChatToolPatientListItem {
    return {
      patientId: patient.id,
      fullName: patient.fullName,
      status: patient.status,
    };
  }
}
