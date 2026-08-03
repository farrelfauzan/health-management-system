import { ConfigService } from '@nestjs/config';

import { ActorPermission } from '../../../common/authorization/actor.types';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { PharmacyFlowService } from '../../pharmacy-flow/service/pharmacy-flow.service';
import { ChatToolRegistrarService } from './chat-tool-registrar.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { ChatToolCaller } from './chat-tool.types';
import { CheckMedicationExpiryTool } from './definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './definitions/check-medication-stock.tool';
import { GetPatientSummaryTool } from './definitions/get-patient-summary.tool';
import { ListMyAppointmentsTool } from './definitions/list-my-appointments.tool';
import { ListMyPatientsTool } from './definitions/list-my-patients.tool';

describe('ChatToolRegistrarService', () => {
  const mockPharmacyFlowService = {
    listMedications: jest.fn(),
    getExpiryReport: jest.fn(),
  } as unknown as PharmacyFlowService;
  const mockPatientManagementService = {
    listPatients: jest.fn(),
    getPatientById: jest.fn(),
  } as unknown as PatientManagementService;
  const mockAppointmentManagementService = {
    listAppointments: jest.fn(),
  } as unknown as AppointmentManagementService;

  /**
   * The grants seed.sql actually gives DOCTOR: `medication.read:any`, and the
   * `:own` scopes on patients and appointments. Not `inventory.read:any`, and
   * not `patient.read:any`.
   */
  const mockDoctorPermissions: ActorPermission[] = [
    { resource: 'Medication', action: 'read', scope: 'ANY' },
    { resource: 'Patient', action: 'read', scope: 'OWN' },
    { resource: 'Appointment', action: 'read', scope: 'OWN' },
  ];

  function buildRegistrar(flagValue: string | undefined): {
    registry: ChatToolRegistry;
    registrar: ChatToolRegistrarService;
  } {
    const registry = new ChatToolRegistry();
    const configService = {
      get: jest.fn().mockReturnValue(flagValue),
    } as unknown as ConfigService;
    return {
      registry,
      registrar: new ChatToolRegistrarService(
        registry,
        configService,
        new CheckMedicationStockTool(mockPharmacyFlowService),
        new CheckMedicationExpiryTool(mockPharmacyFlowService),
        new ListMyPatientsTool(mockPatientManagementService),
        new GetPatientSummaryTool(mockPatientManagementService),
        new ListMyAppointmentsTool(mockAppointmentManagementService, new ConfigService({})),
      ),
    };
  }

  function buildCaller(permissions: ActorPermission[]): ChatToolCaller {
    return {
      user: { sub: 'doctor-user-1', email: 'doctor@clinic.local' },
      roleCodes: ['DOCTOR'],
      permissions,
    };
  }

  it('registers nothing while AI_CHAT_TOOLS_ENABLED is unset', () => {
    // The flag off must reproduce Phase 13 exactly: an empty registry is what
    // makes the orchestration skip the actor fetch and send no `tools` field,
    // so the property is structural rather than a branch to remember.
    const { registry, registrar } = buildRegistrar(undefined);

    registrar.onModuleInit();

    expect(registry.hasRegisteredTools()).toBe(false);
  });

  it('registers nothing when the flag is explicitly false', () => {
    const { registry, registrar } = buildRegistrar('false');

    registrar.onModuleInit();

    expect(registry.hasRegisteredTools()).toBe(false);
  });

  it('registers every tool when the flag is on, whatever its casing', () => {
    const { registry, registrar } = buildRegistrar('  TRUE ');

    registrar.onModuleInit();

    expect(registry.hasRegisteredTools()).toBe(true);
    expect(
      registry
        .listOfferedTools(
          buildCaller([
            ...mockDoctorPermissions,
            { resource: 'Inventory', action: 'read', scope: 'ANY' },
          ]),
          'DOCTOR',
        )
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([
      'check_medication_expiry',
      'check_medication_stock',
      'get_patient_summary',
      'list_my_appointments',
      'list_my_patients',
    ]);
  });

  it('offers a plain doctor stock and the three patient tools, but not expiry', () => {
    // The consequence of declaring each tool's real requirement: a DOCTOR
    // gets the lookups their own permissions open and is never offered the one
    // the domain service would refuse.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const actualOffered = registry.listOfferedTools(buildCaller(mockDoctorPermissions), 'DOCTOR');

    expect(actualOffered.map((tool) => tool.name).sort()).toEqual([
      'check_medication_stock',
      'get_patient_summary',
      'list_my_appointments',
      'list_my_patients',
    ]);
  });

  it('withholds every OWN-scoped patient tool from an ANY-scoped actor', () => {
    // §4.1.1 rule 2, on the tools it was written for. A supervising clinician
    // who can read every patient is not offered "the patients assigned to
    // you" — the broader grant disqualifies rather than qualifies, because
    // the domain services treat ANY as dominant and the tool's own name would
    // stop being true.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const actualOffered = registry.listOfferedTools(
      buildCaller([
        { resource: 'Medication', action: 'read', scope: 'ANY' },
        { resource: 'Patient', action: 'read', scope: 'ANY' },
        { resource: 'Appointment', action: 'read', scope: 'ANY' },
      ]),
      'DOCTOR',
    );

    expect(actualOffered.map((tool) => tool.name)).toEqual(['check_medication_stock']);
  });

  it('withholds them from an actor holding both scopes, since ANY still dominates', () => {
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const actualOffered = registry.listOfferedTools(
      buildCaller([
        { resource: 'Patient', action: 'read', scope: 'OWN' },
        { resource: 'Patient', action: 'read', scope: 'ANY' },
      ]),
      'DOCTOR',
    );

    expect(actualOffered.map((tool) => tool.name)).toEqual([]);
  });

  it('refuses a patient tool at dispatch too, not only in the offered list', async () => {
    // The offering filter is never the only gate: a model naming a tool it
    // was not offered — or an injected instruction doing so — gains nothing.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    await expect(
      registry.dispatchTool({
        caller: buildCaller([{ resource: 'Patient', action: 'read', scope: 'ANY' }]),
        channel: 'DOCTOR',
        toolName: 'list_my_patients',
        arguments: { page: 1 },
      }),
    ).rejects.toThrow('Tool is not available to this session: list_my_patients');
  });

  it('offers no tool at all in a patient-channel session', () => {
    // §2.2: the patient channel gets no tools at all, and the cheapest way to
    // guarantee a patient cannot ask about clinic stock — or about anyone's
    // patient record — is that nothing is ever offered there.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const patientCaller: ChatToolCaller = {
      user: { sub: 'patient-user-1', email: 'patient@example.com' },
      roleCodes: ['PATIENT'],
      permissions: [
        { resource: 'Medication', action: 'read', scope: 'ANY' },
        // A patient legitimately holds `patient.read:own` for their own
        // record, which is exactly the scope list_my_patients requires. The
        // channel/role rule is what stops that coincidence becoming a tool.
        { resource: 'Patient', action: 'read', scope: 'OWN' },
      ],
    };

    expect(registry.listOfferedTools(patientCaller, 'PATIENT')).toEqual([]);
  });
});
