/**
 * Recorded SATUSEHAT staging-sandbox response payloads used by the P10-T06
 * integration tests. The shapes mirror what the sandbox actually returns —
 * Apigee token payloads carry `expires_in` as a string, transaction responses
 * answer with an absolute `_history`-suffixed location URL per entry and carry
 * no `resource` object, and rejections arrive as FHIR OperationOutcome
 * resources — while every identifier and credential value is synthetic.
 * The locations were relative here until a live sandbox call proved the
 * platform returns them absolute; keep them absolute so response parsing is
 * exercised against the real shape.
 */
export const SATUSEHAT_SANDBOX_FIXTURES = {
  encounterIhsId: '1efab4e5-6de2-4a2b-8f43-92c9e13a4c1f',
  tokenResponse: {
    refresh_token_expires_in: '0',
    api_product_list: '[api-satusehat-stg]',
    api_product_list_json: ['api-satusehat-stg'],
    organization_name: 'ts-prod',
    'developer.email': 'clinic@hms.local',
    token_type: 'BearerToken',
    issued_at: '1753693200000',
    client_id: 'recorded-client-id',
    access_token: 'recorded-sandbox-access-token',
    application_name: 'hms-clinic-stg',
    scope: '',
    expires_in: '3599',
    refresh_count: '0',
    status: 'approved',
  },
  transactionResponse: {
    resourceType: 'Bundle',
    type: 'transaction-response',
    entry: [
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Encounter/1efab4e5-6de2-4a2b-8f43-92c9e13a4c1f/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Condition/5b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Procedure/4a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Observation/6c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Medication/7d3e4f5a-6b7c-4d8e-af90-1b2c3d4e5f6a/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/MedicationRequest/8e4f5a6b-7c8d-4e9f-b0a1-2c3d4e5f6a7b/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/MedicationDispense/9f5a6b7c-8d9e-4fa0-b1c2-3d4e5f6a7b8c/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
    ],
  },
  operationOutcomeRejection: {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: 'Validation failed for Encounter resource',
        },
        diagnostics:
          'Encounter.participant[0].individual: Practitioner reference could not be resolved',
      },
    ],
  },
  operationOutcomeServerError: {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'transient',
        details: {
          text: 'Internal server error, please retry',
        },
      },
    ],
  },
} as const;
