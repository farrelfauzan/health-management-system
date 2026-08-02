import { ConfigService } from '@nestjs/config';

import { ActorPermission } from '../../../common/authorization/actor.types';
import { PharmacyFlowService } from '../../pharmacy-flow/service/pharmacy-flow.service';
import { ChatToolRegistrarService } from './chat-tool-registrar.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { ChatToolCaller } from './chat-tool.types';
import { CheckMedicationExpiryTool } from './definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './definitions/check-medication-stock.tool';

describe('ChatToolRegistrarService', () => {
  const mockPharmacyFlowService = {
    listMedications: jest.fn(),
    getExpiryReport: jest.fn(),
  } as unknown as PharmacyFlowService;

  /** The grants seed.sql actually gives DOCTOR for pharmacy data. */
  const mockDoctorPermissions: ActorPermission[] = [
    { resource: 'Medication', action: 'read', scope: 'ANY' },
    { resource: 'patient', action: 'read', scope: 'OWN' },
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

  it('registers both pharmacy tools when the flag is on, whatever its casing', () => {
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
    ).toEqual(['check_medication_expiry', 'check_medication_stock']);
  });

  it('offers a plain doctor stock but not expiry, because they hold no inventory grant', () => {
    // The consequence of declaring each tool's real requirement: a DOCTOR
    // gets the lookup their own permissions open and is never offered the one
    // the domain service would refuse.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const actualOffered = registry.listOfferedTools(buildCaller(mockDoctorPermissions), 'DOCTOR');

    expect(actualOffered.map((tool) => tool.name)).toEqual(['check_medication_stock']);
  });

  it('offers neither pharmacy tool in a patient-channel session', () => {
    // §2.2: the patient channel gets no tools at all, and the cheapest way to
    // guarantee a patient cannot ask about clinic stock is that nothing is
    // ever offered there.
    const { registry, registrar } = buildRegistrar('true');
    registrar.onModuleInit();

    const patientCaller: ChatToolCaller = {
      user: { sub: 'patient-user-1', email: 'patient@example.com' },
      roleCodes: ['PATIENT'],
      permissions: [{ resource: 'Medication', action: 'read', scope: 'ANY' }],
    };

    expect(registry.listOfferedTools(patientCaller, 'PATIENT')).toEqual([]);
  });
});
