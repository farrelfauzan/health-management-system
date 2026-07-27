import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

import { AdminManagementController } from '../../modules/admin-management/controller/admin-management.controller';
import { RbacController } from '../../modules/rbac/controller/rbac.controller';
import { AppointmentManagementController } from '../../modules/appointment-management/controller/appointment-management.controller';
import { DoctorManagementController } from '../../modules/doctor-management/controller/doctor-management.controller';
import { DoctorPatientController } from '../../modules/doctor-patient/controller/doctor-patient.controller';
import { PatientManagementController } from '../../modules/patient-management/controller/patient-management.controller';
import { DispenseController } from '../../modules/pharmacy-flow/controller/dispense.controller';
import { MedicationController } from '../../modules/pharmacy-flow/controller/medication.controller';
import { PrescriptionController } from '../../modules/pharmacy-flow/controller/prescription.controller';
import { RegistrationFlowController } from '../../modules/registration-flow/controller/registration-flow.controller';
import { PERMISSION_CHECKER_KEY } from '../authorization/check-permissions.decorator';
import { PermissionRule } from '../authorization/permission-rule.type';

type ControllerType = {
  readonly prototype: object;
};

type ExpectedOperation = {
  readonly controller: ControllerType;
  readonly methodName: string;
  readonly httpMethod: 'delete' | 'get' | 'patch' | 'post';
  readonly path: string;
  readonly permission: PermissionRule;
  readonly hasRequestBody: boolean;
};

type OpenApiMediaType = {
  readonly examples?: {
    readonly default?: {
      readonly value?: unknown;
    };
  };
  readonly schema?: {
    readonly example?: unknown;
  };
};

type OpenApiOperation = {
  readonly summary?: string;
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly requestBody?: {
    readonly content?: Record<string, OpenApiMediaType>;
  };
  readonly responses?: Record<
    string,
    {
      readonly content?: Record<string, OpenApiMediaType>;
    }
  >;
};

type OpenApiDocument = {
  readonly paths: Record<string, Partial<Record<ExpectedOperation['httpMethod'], OpenApiOperation>>>;
};

const expectedOperations: readonly ExpectedOperation[] = [
  operation(AdminManagementController, 'listUsers', 'get', '/api/v1/users', 'read', 'User'),
  operation(AdminManagementController, 'createAdminUser', 'post', '/api/v1/users', 'create', 'User', true),
  operation(AdminManagementController, 'updateAdminUser', 'patch', '/api/v1/users/{id}', 'update', 'User', true),
  operation(PatientManagementController, 'listPatients', 'get', '/api/v1/patients', 'read', 'Patient'),
  operation(PatientManagementController, 'getPatientById', 'get', '/api/v1/patients/{id}', 'read', 'Patient'),
  operation(PatientManagementController, 'createPatient', 'post', '/api/v1/patients', 'create', 'Patient', true),
  operation(PatientManagementController, 'updatePatient', 'patch', '/api/v1/patients/{id}', 'update', 'Patient', true),
  operation(DoctorManagementController, 'listDoctors', 'get', '/api/v1/doctors', 'read', 'Doctor'),
  operation(DoctorManagementController, 'getDoctorById', 'get', '/api/v1/doctors/{id}', 'read', 'Doctor'),
  operation(DoctorManagementController, 'createDoctor', 'post', '/api/v1/doctors', 'create', 'Doctor', true),
  operation(DoctorManagementController, 'updateDoctorSchedule', 'patch', '/api/v1/doctors/{id}/schedule', 'write', 'DoctorSchedule', true),
  operation(DoctorPatientController, 'assignDoctorToPatient', 'post', '/api/v1/doctor-patient-assignments', 'assign', 'DoctorPatient', true),
  operation(DoctorPatientController, 'listActivity', 'get', '/api/v1/doctor-patient-assignments/activity', 'read', 'DoctorPatientActivity'),
  operation(DoctorPatientController, 'unassignDoctorFromPatient', 'delete', '/api/v1/doctor-patient-assignments/{id}', 'unassign', 'DoctorPatient'),
  operation(AppointmentManagementController, 'listAppointments', 'get', '/api/v1/appointments', 'read', 'Appointment'),
  operation(AppointmentManagementController, 'getAppointmentById', 'get', '/api/v1/appointments/{id}', 'read', 'Appointment'),
  operation(AppointmentManagementController, 'createAppointment', 'post', '/api/v1/appointments', 'create', 'Appointment', true),
  operation(AppointmentManagementController, 'updateAppointment', 'patch', '/api/v1/appointments/{id}', 'update', 'Appointment', true),
  operation(AppointmentManagementController, 'cancelAppointment', 'post', '/api/v1/appointments/{id}/cancel', 'cancel', 'Appointment', true),
  operation(RegistrationFlowController, 'listRegistrations', 'get', '/api/v1/registrations', 'read', 'Registration'),
  operation(RegistrationFlowController, 'getRegistrationById', 'get', '/api/v1/registrations/{id}', 'read', 'Registration'),
  operation(RegistrationFlowController, 'createRegistration', 'post', '/api/v1/registrations', 'create', 'Registration', true),
  operation(RegistrationFlowController, 'updateRegistration', 'patch', '/api/v1/registrations/{id}', 'update', 'Registration', true),
  operation(MedicationController, 'listMedications', 'get', '/api/v1/medications', 'read', 'Medication'),
  operation(MedicationController, 'createMedication', 'post', '/api/v1/medications', 'create', 'Medication', true),
  operation(MedicationController, 'updateMedication', 'patch', '/api/v1/medications/{id}', 'update', 'Medication', true),
  operation(PrescriptionController, 'createPrescription', 'post', '/api/v1/prescriptions', 'write', 'Prescription', true),
  operation(DispenseController, 'createDispense', 'post', '/api/v1/dispenses', 'write', 'DispenseRecord', true),
  operation(RbacController, 'getRoles', 'get', '/api/v1/rbac/roles', 'read', 'Role'),
  operation(RbacController, 'assignRole', 'post', '/api/v1/rbac/assign-role', 'assign', 'Role', true),
  operation(RbacController, 'unassignRole', 'post', '/api/v1/rbac/unassign-role', 'unassign', 'Role', true),
];

type ExpectedPublicOperation = {
  readonly httpMethod: ExpectedOperation['httpMethod'];
  readonly path: string;
  readonly hasRequestBody: boolean;
};

const expectedPublicOperations: readonly ExpectedPublicOperation[] = [
  { httpMethod: 'post', path: '/api/v1/auth/login', hasRequestBody: true },
  { httpMethod: 'post', path: '/api/v1/auth/refresh', hasRequestBody: true },
  { httpMethod: 'post', path: '/api/v1/auth/logout', hasRequestBody: true },
  { httpMethod: 'get', path: '/api/v1/health', hasRequestBody: false },
];

function operation(
  controller: ControllerType,
  methodName: string,
  httpMethod: ExpectedOperation['httpMethod'],
  path: string,
  action: string,
  subject: string,
  hasRequestBody = false,
): ExpectedOperation {
  return {
    controller,
    methodName,
    httpMethod,
    path,
    permission: { action, subject },
    hasRequestBody,
  };
}

function loadOpenApiDocument(): OpenApiDocument {
  const contractPath = resolve(process.cwd(), 'openapi.yaml');
  return parse(readFileSync(contractPath, 'utf8')) as OpenApiDocument;
}

describe('Phase 3 backend readiness', () => {
  it('declares permission metadata for every Phase 3 endpoint', () => {
    expectedOperations.forEach((expectedOperation) => {
      const controllerPrototype = expectedOperation.controller.prototype as Record<string, unknown>;
      const controllerMethod = controllerPrototype[expectedOperation.methodName];
      const actualRules = Reflect.getMetadata(
        PERMISSION_CHECKER_KEY,
        controllerMethod as object,
      ) as PermissionRule[] | undefined;
      expect(actualRules).toContainEqual(expectedOperation.permission);
    });
  });

  it('publishes documented and authenticated OpenAPI operations with examples', () => {
    const document = loadOpenApiDocument();
    expectedOperations.forEach((expectedOperation) => {
      const actualOperation = document.paths[expectedOperation.path]?.[expectedOperation.httpMethod];
      expect(actualOperation?.summary).toBeTruthy();
      expect(actualOperation?.security).toEqual(
        expect.arrayContaining([expect.objectContaining({ bearer: [] })]),
      );
      const successStatus = Object.keys(actualOperation?.responses ?? {}).find((status) =>
        status.startsWith('2'),
      );
      const successMediaType =
        actualOperation?.responses?.[successStatus ?? '']?.content?.['application/json'];
      expect(successMediaType?.schema?.example).toBeDefined();
      if (expectedOperation.hasRequestBody) {
        const requestMediaType = actualOperation?.requestBody?.content?.['application/json'];
        expect(requestMediaType?.examples?.default?.value).toBeDefined();
      }
    });
  });

  it('publishes documented public OpenAPI operations with examples', () => {
    const document = loadOpenApiDocument();
    expectedPublicOperations.forEach((expectedOperation) => {
      const actualOperation = document.paths[expectedOperation.path]?.[expectedOperation.httpMethod];
      expect(actualOperation?.summary).toBeTruthy();
      const successStatus = Object.keys(actualOperation?.responses ?? {}).find((status) =>
        status.startsWith('2'),
      );
      const successMediaType =
        actualOperation?.responses?.[successStatus ?? '']?.content?.['application/json'];
      expect(successMediaType?.schema?.example).toBeDefined();
      if (expectedOperation.hasRequestBody) {
        const requestMediaType = actualOperation?.requestBody?.content?.['application/json'];
        expect(requestMediaType?.examples?.default?.value).toBeDefined();
      }
    });
  });
});
