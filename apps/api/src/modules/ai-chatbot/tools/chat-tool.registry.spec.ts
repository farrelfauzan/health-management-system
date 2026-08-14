import {
  checkMedicationStockToolArgsSchema,
  listMyPatientsToolArgsSchema,
} from '@hms/shared-types';

import { ActorPermission } from '../../../common/authorization/actor.types';
import { AiChatbotError } from '../ai-chatbot.error';
import { ChatTool } from './chat-tool.interface';
import { ChatToolRegistry } from './chat-tool.registry';
import { ChatToolCaller } from './chat-tool.types';

describe('ChatToolRegistry', () => {
  function buildListMyPatientsTool(execute: jest.Mock = jest.fn()): ChatTool {
    return {
      name: 'list_my_patients',
      description: 'List the patients assigned to you',
      channels: ['DOCTOR'],
      allowedRoleCodes: ['DOCTOR'],
      requiredPermission: { resource: 'patient', action: 'read', scope: 'OWN' },
      argumentSchema: listMyPatientsToolArgsSchema,
      execute,
    };
  }

  function buildStockTool(execute: jest.Mock = jest.fn()): ChatTool {
    return {
      name: 'check_medication_stock',
      description: 'Check current medication stock levels',
      channels: ['DOCTOR'],
      allowedRoleCodes: ['DOCTOR'],
      requiredPermission: { resource: 'medication', action: 'read', scope: 'ANY' },
      argumentSchema: checkMedicationStockToolArgsSchema,
      execute,
    };
  }

  function buildCaller(roleCodes: string[], permissions: ActorPermission[]): ChatToolCaller {
    return {
      user: { sub: 'user-1', email: 'user@example.com' },
      roleCodes,
      permissions,
    };
  }

  function buildRegistry(tools: ChatTool[]): ChatToolRegistry {
    const registry = new ChatToolRegistry();
    tools.forEach((tool) => registry.registerTool(tool));
    return registry;
  }

  const mockDoctorPermissions: ActorPermission[] = [
    { resource: 'patient', action: 'read', scope: 'OWN' },
    { resource: 'medication', action: 'read', scope: 'ANY' },
  ];

  async function captureDispatchError(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
      return null;
    } catch (caughtError) {
      return caughtError;
    }
  }

  describe('offering', () => {
    it('offers a doctor with OWN-scoped patient.read the full doctor catalogue', () => {
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool()]);
      const doctorCaller = buildCaller(['DOCTOR'], mockDoctorPermissions);

      const actualOffered = registry.listOfferedTools(doctorCaller, 'DOCTOR');

      expect(actualOffered.map((tool) => tool.name).sort()).toEqual([
        'check_medication_stock',
        'list_my_patients',
      ]);
    });

    it('never offers a tool whose permission the caller lacks', () => {
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool()]);
      const doctorWithoutMedication = buildCaller(['DOCTOR'], [
        { resource: 'patient', action: 'read', scope: 'OWN' },
      ]);

      const actualOffered = registry.listOfferedTools(doctorWithoutMedication, 'DOCTOR');

      expect(actualOffered.map((tool) => tool.name)).toEqual(['list_my_patients']);
    });

    it('offers zero tools to an ADMIN who opened a DOCTOR-channel session', () => {
      // §4.1.1 rule 1: the channel a session claims is not evidence about who
      // opened it. The admin's medication.read:any would satisfy the stock
      // tool, so an empty list proves "no tools at all", not a reduced set.
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool()]);
      const adminCaller = buildCaller(['ADMIN'], [
        { resource: 'patient', action: 'read', scope: 'ANY' },
        { resource: 'medication', action: 'read', scope: 'ANY' },
      ]);

      const actualOffered = registry.listOfferedTools(adminCaller, 'DOCTOR');

      expect(actualOffered).toEqual([]);
    });

    it('withholds list_my_patients from an actor whose patient.read resolves to ANY', () => {
      // §4.1.1 rule 2: the broader permission disqualifies. The stock tool
      // stays offered — per-tool reduction is correct here, unlike rule 1.
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool()]);
      const anyScopedDoctor = buildCaller(['DOCTOR'], [
        { resource: 'patient', action: 'read', scope: 'ANY' },
        { resource: 'medication', action: 'read', scope: 'ANY' },
      ]);

      const actualOffered = registry.listOfferedTools(anyScopedDoctor, 'DOCTOR');

      expect(actualOffered.map((tool) => tool.name)).toEqual(['check_medication_stock']);
    });

    it('withholds an OWN-scoped tool when the caller holds both OWN and ANY grants', () => {
      const registry = buildRegistry([buildListMyPatientsTool()]);
      const dualScopedDoctor = buildCaller(['DOCTOR'], [
        { resource: 'patient', action: 'read', scope: 'OWN' },
        { resource: 'patient', action: 'read', scope: 'ANY' },
      ]);

      const actualOffered = registry.listOfferedTools(dualScopedDoctor, 'DOCTOR');

      expect(actualOffered).toEqual([]);
    });

    it('offers zero tools on the patient channel', () => {
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool()]);
      const patientCaller = buildCaller(['PATIENT'], [
        { resource: 'patient', action: 'read', scope: 'OWN' },
      ]);

      const actualOffered = registry.listOfferedTools(patientCaller, 'PATIENT');

      expect(actualOffered).toEqual([]);
    });
  });

  describe('dispatch', () => {
    it('executes an offered tool with schema-validated, defaulted arguments', async () => {
      const mockExecute = jest.fn().mockResolvedValue({ patients: [] });
      const registry = buildRegistry([buildListMyPatientsTool(mockExecute)]);
      const doctorCaller = buildCaller(['DOCTOR'], mockDoctorPermissions);

      const actualOutcome = await registry.dispatchTool({
        caller: doctorCaller,
        channel: 'DOCTOR',
        toolName: 'list_my_patients',
        arguments: {},
      });

      expect(actualOutcome).toEqual({
        toolName: 'list_my_patients',
        validatedArguments: { page: 1 },
        result: { patients: [] },
      });
      expect(mockExecute).toHaveBeenCalledWith(doctorCaller.user, { page: 1 });
    });

    it('refuses dispatch of a tool whose permission the caller lacks', async () => {
      // The offering filter is not the only gate: the same caller who never
      // saw the tool in the catalogue is refused again by name at dispatch.
      const mockExecute = jest.fn();
      const registry = buildRegistry([buildListMyPatientsTool(), buildStockTool(mockExecute)]);
      const doctorWithoutMedication = buildCaller(['DOCTOR'], [
        { resource: 'patient', action: 'read', scope: 'OWN' },
      ]);

      const actualError = await captureDispatchError(() =>
        registry.dispatchTool({
          caller: doctorWithoutMedication,
          channel: 'DOCTOR',
          toolName: 'check_medication_stock',
          arguments: {},
        }),
      );

      expect(actualError).toBeInstanceOf(AiChatbotError);
      expect((actualError as AiChatbotError).code).toBe('AI_TOOL_UNAVAILABLE');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('refuses every dispatch from an ADMIN in a DOCTOR-channel session', async () => {
      const mockExecute = jest.fn();
      const registry = buildRegistry([buildStockTool(mockExecute)]);
      const adminCaller = buildCaller(['ADMIN'], [
        { resource: 'medication', action: 'read', scope: 'ANY' },
      ]);

      const actualError = await captureDispatchError(() =>
        registry.dispatchTool({
          caller: adminCaller,
          channel: 'DOCTOR',
          toolName: 'check_medication_stock',
          arguments: {},
        }),
      );

      expect((actualError as AiChatbotError).code).toBe('AI_TOOL_UNAVAILABLE');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('refuses dispatch of list_my_patients to an ANY-scoped actor', async () => {
      const mockExecute = jest.fn();
      const registry = buildRegistry([buildListMyPatientsTool(mockExecute)]);
      const anyScopedDoctor = buildCaller(['DOCTOR'], [
        { resource: 'patient', action: 'read', scope: 'ANY' },
      ]);

      const actualError = await captureDispatchError(() =>
        registry.dispatchTool({
          caller: anyScopedDoctor,
          channel: 'DOCTOR',
          toolName: 'list_my_patients',
          arguments: { page: 1 },
        }),
      );

      expect((actualError as AiChatbotError).code).toBe('AI_TOOL_UNAVAILABLE');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('refuses an unknown tool name without executing anything', async () => {
      const registry = buildRegistry([buildStockTool()]);
      const doctorCaller = buildCaller(['DOCTOR'], mockDoctorPermissions);

      const actualError = await captureDispatchError(() =>
        registry.dispatchTool({
          caller: doctorCaller,
          channel: 'DOCTOR',
          toolName: 'drop_all_tables',
          arguments: {},
        }),
      );

      expect((actualError as AiChatbotError).code).toBe('AI_TOOL_UNAVAILABLE');
    });

    it('rejects hallucinated arguments at the schema, not the service', async () => {
      const mockExecute = jest.fn();
      const registry = buildRegistry([buildListMyPatientsTool(mockExecute)]);
      const doctorCaller = buildCaller(['DOCTOR'], mockDoctorPermissions);

      const actualError = await captureDispatchError(() =>
        registry.dispatchTool({
          caller: doctorCaller,
          channel: 'DOCTOR',
          toolName: 'list_my_patients',
          arguments: { page: 0 },
        }),
      );

      expect((actualError as AiChatbotError).code).toBe('AI_TOOL_INVALID_ARGUMENTS');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('registration', () => {
    it('refuses a duplicate tool name', () => {
      const registry = buildRegistry([buildStockTool()]);

      expect(() => registry.registerTool(buildStockTool())).toThrow(
        'Chat tool is already registered: check_medication_stock',
      );
    });

    /**
     * SJ-14. Each case is a tool the compiler would have accepted through a
     * cast — a test double, a half-finished definition — and each one names a
     * field the offering rules later read to decide who may call it.
     */
    it('refuses a tool that declares no required permission', () => {
      const registry = new ChatToolRegistry();
      const inputTool = { ...buildStockTool(), requiredPermission: undefined };

      expect(() => registry.registerTool(inputTool as unknown as ChatTool)).toThrow(
        'Chat tool declaration is invalid (check_medication_stock): requiredPermission is missing',
      );
    });

    it('refuses a permission whose scope is neither ANY nor OWN', () => {
      const registry = new ChatToolRegistry();
      const inputTool = {
        ...buildStockTool(),
        requiredPermission: { resource: 'medication', action: 'read', scope: 'ALL' },
      };

      expect(() => registry.registerTool(inputTool as unknown as ChatTool)).toThrow(
        'requiredPermission.scope must be ANY or OWN, got ALL',
      );
    });

    it('refuses a tool that could never be offered to anyone', () => {
      const registry = new ChatToolRegistry();
      const inputTool = { ...buildStockTool(), channels: [], allowedRoleCodes: [] };

      expect(() => registry.registerTool(inputTool as unknown as ChatTool)).toThrow(
        'channels is empty, so the tool could never be offered; allowedRoleCodes is empty',
      );
    });

    it('names the tool in the failure, because nothing else identifies it at boot', () => {
      const registry = new ChatToolRegistry();
      const inputTool = { ...buildListMyPatientsTool(), execute: undefined };

      expect(() => registry.registerTool(inputTool as unknown as ChatTool)).toThrow(
        'Chat tool declaration is invalid (list_my_patients): execute is not a function',
      );
    });

    it('registers nothing when the declaration is rejected', () => {
      const registry = new ChatToolRegistry();
      const inputTool = { ...buildStockTool(), requiredPermission: undefined };

      expect(() => registry.registerTool(inputTool as unknown as ChatTool)).toThrow();
      expect(registry.hasRegisteredTools()).toBe(false);
    });
  });
});
