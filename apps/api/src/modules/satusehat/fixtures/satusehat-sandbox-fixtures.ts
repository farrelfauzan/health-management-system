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
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/AllergyIntolerance/5b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4f/_history/1',
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
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/ClinicalImpression/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/_history/1',
          etag: 'W/"1"',
          lastModified: '2026-07-28T09:05:01.000+00:00',
        },
      },
      {
        response: {
          status: '201 Created',
          location: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Composition/2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e/_history/1',
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
  /**
   * The `nik-ibu` search and create (P24-T11), **hand-built from the master
   * patient index documentation rather than recorded**: staging has no female
   * test mother, so the call has never been observable there (spike §2). The
   * shapes follow the published page; every NIK here is synthetic, and the
   * repository is public, so no real one may ever replace them.
   *
   * The search deliberately returns two of one mother's children, because
   * that is what a `nik-ibu` search does — telling siblings apart is the whole
   * job of the selection this exercises.
   */
  nikIbuSearchBundle: {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 2,
    entry: [
      {
        fullUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Patient/P-sibling-2019',
        resource: {
          resourceType: 'Patient',
          id: 'P-sibling-2019',
          gender: 'male',
          birthDate: '2019-04-01',
          multipleBirthInteger: 1,
        },
      },
      {
        fullUrl: 'https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1/Patient/P-newborn-2026',
        resource: {
          resourceType: 'Patient',
          id: 'P-newborn-2026',
          gender: 'female',
          birthDate: '2026-09-20',
          multipleBirthInteger: 2,
        },
      },
    ],
  },
  /** The same search for a mother whose children are not on the index yet. */
  nikIbuEmptySearchBundle: {
    resourceType: 'Bundle',
    type: 'searchset',
    total: 0,
  },
  /** What a create answers with: the resource, carrying its assigned id. */
  newbornCreateResponse: {
    resourceType: 'Patient',
    id: 'P-newborn-created',
    gender: 'female',
    birthDate: '2026-09-20',
    multipleBirthInteger: 2,
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
