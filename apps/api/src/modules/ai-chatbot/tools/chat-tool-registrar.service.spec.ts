import { ConfigService } from '@nestjs/config';

import { ActorPermission } from '../../../common/authorization/actor.types';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { CashierReportService } from '../../billing/service/cashier-report.service';
import { RegistrationFlowService } from '../../registration-flow/service/registration-flow.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { PharmacyFlowService } from '../../pharmacy-flow/service/pharmacy-flow.service';
import { ChatToolRegistrarService } from './chat-tool-registrar.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { ChatToolCaller } from './chat-tool.types';
import { CheckMedicationExpiryTool } from './definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './definitions/check-medication-stock.tool';
import { GetAppointmentLoadTool } from './definitions/get-appointment-load.tool';
import { GetDailyCashierReportTool } from './definitions/get-daily-cashier-report.tool';
import { GetPatientSummaryTool } from './definitions/get-patient-summary.tool';
import { GetQueueBoardSummaryTool } from './definitions/get-queue-board-summary.tool';
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
    listSessionsCalendar: jest.fn(),
  } as unknown as AppointmentManagementService;
  const mockRegistrationFlowService = {
    getQueueBoard: jest.fn(),
  } as unknown as RegistrationFlowService;
  const mockCashierReportService = {
    getDailyReport: jest.fn(),
  } as unknown as CashierReportService;

  /** The grants seed.sql gives ADMIN for the three admin-channel tools. */
  const mockAdminPermissions: ActorPermission[] = [
    { resource: 'Registration', action: 'read', scope: 'ANY' },
    { resource: 'Invoice', action: 'read', scope: 'ANY' },
    { resource: 'AppointmentSession', action: 'read', scope: 'ANY' },
    { resource: 'Medication', action: 'read', scope: 'ANY' },
    { resource: 'Inventory', action: 'read', scope: 'ANY' },
  ];

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
        new GetQueueBoardSummaryTool(mockRegistrationFlowService),
        new GetDailyCashierReportTool(mockCashierReportService),
        new GetAppointmentLoadTool(mockAppointmentManagementService, new ConfigService({})),
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

  it('offers an admin their five tools — three own plus the two shared pharmacy ones', () => {
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const adminCaller: ChatToolCaller = {
      user: { sub: 'admin-user-1', email: 'admin@clinic.local' },
      roleCodes: ['ADMIN'],
      permissions: mockAdminPermissions,
    };

    expect(
      registry
        .listOfferedTools(adminCaller, 'ADMIN')
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([
      'check_medication_expiry',
      'check_medication_stock',
      'get_appointment_load',
      'get_daily_cashier_report',
      'get_queue_board_summary',
    ]);
  });

  it('never offers an admin a patient tool, even holding every grant', () => {
    // The three patient tools require `Patient:read` resolved to OWN, which an
    // admin's ANY grant disqualifies, and their channel list excludes ADMIN.
    // Both rules point the same way, which is the intent.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const adminCaller: ChatToolCaller = {
      user: { sub: 'admin-user-1', email: 'admin@clinic.local' },
      roleCodes: ['ADMIN'],
      permissions: [
        ...mockAdminPermissions,
        { resource: 'Patient', action: 'read', scope: 'OWN' },
        { resource: 'Appointment', action: 'read', scope: 'OWN' },
      ],
    };

    const actualNames = registry.listOfferedTools(adminCaller, 'ADMIN').map((tool) => tool.name);

    expect(actualNames).not.toContain('list_my_patients');
    expect(actualNames).not.toContain('get_patient_summary');
    expect(actualNames).not.toContain('list_my_appointments');
  });

  it('offers SUPER_ADMIN the same admin catalogue', () => {
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const superAdminCaller: ChatToolCaller = {
      user: { sub: 'super-1', email: 'super@clinic.local' },
      roleCodes: ['SUPER_ADMIN'],
      permissions: mockAdminPermissions,
    };

    expect(registry.listOfferedTools(superAdminCaller, 'ADMIN')).toHaveLength(5);
  });

  it('withholds the cashier report from an admin without the invoice grant', () => {
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const adminCaller: ChatToolCaller = {
      user: { sub: 'admin-user-1', email: 'admin@clinic.local' },
      roleCodes: ['ADMIN'],
      permissions: mockAdminPermissions.filter(
        (permission) => permission.resource !== 'Invoice',
      ),
    };

    expect(
      registry.listOfferedTools(adminCaller, 'ADMIN').map((tool) => tool.name),
    ).not.toContain('get_daily_cashier_report');
  });

  it('offers a doctor-channel session nothing to an ADMIN, whatever they hold', () => {
    // §4.1.1 rule 1, and the reason ADMIN needed its own channel value: the
    // channel a session claims is chosen by the client and is not evidence
    // about who opened it. This actor holds the grant the stock tool
    // requires and is still offered zero tools.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const adminCaller: ChatToolCaller = {
      user: { sub: 'admin-user-1', email: 'admin@clinic.local' },
      roleCodes: ['ADMIN'],
      permissions: [{ resource: 'Medication', action: 'read', scope: 'ANY' }],
    };

    expect(registry.listOfferedTools(adminCaller, 'DOCTOR')).toEqual([]);
  });

  it('offers no doctor tool to a DOCTOR who opened an admin-channel session', () => {
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    expect(registry.listOfferedTools(buildCaller(mockDoctorPermissions), 'ADMIN')).toEqual([]);
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
