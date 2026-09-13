/**
 * SATUSEHAT read-back responses, **recorded from the live staging sandbox** on
 * 2026-09-12 (P21-T01 / SJ-179). Findings and the full probe log:
 * `docs/ops/satusehat-read-back-spike.md`.
 *
 * These are real platform responses to `GET /<Type>/:id`, captured for an
 * encounter this clinic actually submitted through the worker — not
 * hand-written. That distinction is the whole point of the spike: the
 * encounter-id parser once passed its entire suite against hand-made fixtures
 * whose `Location` header was relative, then returned `null` in production
 * against the platform's absolute URLs
 * (`docs/ops/satusehat-encounter-id-backfill-runbook.md`).
 *
 * Three shapes here will break naive code, and every consumer must be tested
 * against them:
 *
 * 1. **`subject.display` carries the patient's name on every type.** A
 *    presence-only projection (P21-T03) must therefore be an allowlist of kept
 *    fields; a denylist of "clinical" keys leaks the name to the front desk.
 * 2. **`Condition` has no `status`** — it carries `clinicalStatus`. Comparison
 *    logic keyed on `status` reports every diagnosis as differing.
 * 3. **`Composition.identifier` is an object**, while `Procedure`,
 *    `MedicationRequest` and `ClinicalImpression` return arrays — and
 *    `MedicationRequest` returns *two* identifiers, so matching must select by
 *    `system` rather than index.
 *
 * Patient and practitioner display names and the patient IHS number have been
 * replaced with obvious test values; codes and structure are verbatim.
 *
 * Every UUID has also been replaced with a placeholder — the organization id,
 * the practitioner IHS number and the resource ids the platform assigned. This
 * repository is public, and those identify a real facility and a real health
 * worker even on the sandbox. Only their *shape* matters to the code under
 * test, and `meta.versionId` is kept exactly as the platform wrote it because
 * its opaque format is the thing a comparison must not assume anything about.
 */
export const SATUSEHAT_READ_BACK_FIXTURES = {
  Encounter: {
    class: {
      code: 'AMB',
      display: 'ambulatory',
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    },
    diagnosis: [
      {
        condition: {
          reference: 'Condition/00000001-0000-4000-8000-000000000001',
        },
        rank: 1,
        use: {
          coding: [
            {
              code: 'DD',
              display: 'Discharge diagnosis',
              system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
            },
          ],
        },
      },
    ],
    id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    identifier: [
      {
        system: 'http://sys-ids.kemkes.go.id/encounter/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: '0000000d-0000-4000-8000-00000000000d',
      },
    ],
    location: [
      {
        location: {
          display: 'Ruang Poli Umum',
          reference: 'Location/00000006-0000-4000-8000-000000000006',
        },
      },
    ],
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    participant: [
      {
        individual: {
          display: 'dr. Dokter Uji',
          reference: 'Practitioner/1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
        },
        type: [
          {
            coding: [
              {
                code: 'ATND',
                display: 'attender',
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
              },
            ],
          },
        ],
      },
    ],
    period: {
      end: '2026-09-11T14:52:06.565Z',
      start: '2026-09-11T14:39:41.583Z',
    },
    resourceType: 'Encounter',
    serviceProvider: {
      reference: 'Organization/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    },
    status: 'finished',
    statusHistory: [
      {
        period: {
          end: '2026-09-11T14:39:57.582Z',
          start: '2026-09-11T14:39:41.583Z',
        },
        status: 'arrived',
      },
      {
        period: {
          end: '2026-09-11T14:52:06.565Z',
          start: '2026-09-11T14:39:57.582Z',
        },
        status: 'in-progress',
      },
      {
        period: {
          end: '2026-09-11T14:52:06.565Z',
          start: '2026-09-11T14:52:06.565Z',
        },
        status: 'finished',
      },
    ],
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
  },
  Condition: {
    category: [
      {
        coding: [
          {
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
          },
        ],
      },
    ],
    clinicalStatus: {
      coding: [
        {
          code: 'active',
          display: 'Active',
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        },
      ],
    },
    code: {
      coding: [
        {
          code: 'A90',
          display: 'Dengue fever [classical dengue]',
          system: 'http://hl7.org/fhir/sid/icd-10',
        },
      ],
    },
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    id: '00000001-0000-4000-8000-000000000001',
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    recordedDate: '2026-09-11T14:41:28.619Z',
    resourceType: 'Condition',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
  },
  Observation: {
    basedOn: [
      {
        reference: 'ServiceRequest/00000009-0000-4000-8000-000000000009',
      },
    ],
    category: [
      {
        coding: [
          {
            code: 'laboratory',
            display: 'Laboratory',
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          code: '5818-0',
          display: 'Urobilinogen [Mass/volume] in Urine by Test strip',
          system: 'http://loinc.org',
        },
      ],
    },
    effectiveDateTime: '2026-09-11T14:49:32.047Z',
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    id: '00000002-0000-4000-8000-000000000002',
    interpretation: [
      {
        coding: [
          {
            code: 'A',
            display: 'Abnormal',
            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          },
        ],
      },
    ],
    issued: '2026-09-11T14:51:12.799Z',
    meta: {
      lastUpdated: '2026-09-11T15:57:08.498795+00:00',
      versionId: 'MTc4OTE0MjIyODQ5ODc5NTAwMA',
    },
    performer: [
      {
        reference: 'Organization/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      },
    ],
    referenceRange: [
      {
        text: 'Normal',
      },
    ],
    resourceType: 'Observation',
    specimen: {
      reference: 'Specimen/00000008-0000-4000-8000-000000000008',
    },
    status: 'final',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
    valueCodeableConcept: {
      text: 'Meningkat',
    },
  },
  Procedure: {
    code: {
      coding: [
        {
          code: '89.7',
          display: 'General physical examination',
          system: 'http://hl7.org/fhir/sid/icd-9-cm',
        },
      ],
    },
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    id: '00000011-0000-4000-8000-000000000011',
    identifier: [
      {
        system: 'http://sys-ids.kemkes.go.id/procedure/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: '0000000b-0000-4000-8000-00000000000b',
      },
    ],
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    note: [
      {
        text: 'berak mencret di klinik',
      },
    ],
    performedPeriod: {
      end: '2026-09-11T14:42:04.715Z',
      start: '2026-09-11T14:42:04.715Z',
    },
    performer: [
      {
        actor: {
          display: 'dr. Dokter Uji',
          reference: 'Practitioner/1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
        },
      },
    ],
    resourceType: 'Procedure',
    status: 'completed',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
  },
  MedicationRequest: {
    authoredOn: '2026-09-11T14:48:33.857Z',
    dispenseRequest: {
      quantity: {
        code: 'CAP',
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        unit: 'CAP',
        value: 20,
      },
    },
    dosageInstruction: [
      {
        sequence: 1,
        text: '500 mg, 3x, minum abis makan',
      },
    ],
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    id: '0000000f-0000-4000-8000-00000000000f',
    identifier: [
      {
        system: 'http://sys-ids.kemkes.go.id/prescription/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: '00000007-0000-4000-8000-000000000007',
      },
      {
        system:
          'http://sys-ids.kemkes.go.id/prescription-item/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: '0000000a-0000-4000-8000-00000000000a',
      },
    ],
    intent: 'order',
    medicationReference: {
      display: 'Omeprazole',
      reference: 'Medication/00000012-0000-4000-8000-000000000012',
    },
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    requester: {
      display: 'dr. Dokter Uji',
      reference: 'Practitioner/1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
    },
    resourceType: 'MedicationRequest',
    status: 'completed',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
    substitution: {
      allowedBoolean: false,
    },
  },
  ClinicalImpression: {
    assessor: {
      display: 'dr. Dokter Uji',
      reference: 'Practitioner/1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
    },
    effectiveDateTime: '2026-09-11T14:52:06.565Z',
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    finding: [
      {
        itemReference: {
          reference: 'Condition/00000001-0000-4000-8000-000000000001',
        },
      },
    ],
    id: '0000000c-0000-4000-8000-00000000000c',
    identifier: [
      {
        system:
          'http://sys-ids.kemkes.go.id/clinicalimpression/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: '0000000d-0000-4000-8000-00000000000d',
      },
    ],
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
  },
  Composition: {
    author: [
      {
        display: 'dr. Dokter Uji',
        reference: 'Practitioner/1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
      },
    ],
    category: [
      {
        coding: [
          {
            code: '34117-2',
            display: 'History and physical note',
            system: 'http://loinc.org',
          },
        ],
      },
    ],
    custodian: {
      reference: 'Organization/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    },
    date: '2026-09-11T14:52:06.565Z',
    encounter: {
      reference: 'Encounter/2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
    },
    id: '00000005-0000-4000-8000-000000000005',
    identifier: {
      system: 'http://sys-ids.kemkes.go.id/composition/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      use: 'official',
      value: '0000000d-0000-4000-8000-00000000000d',
    },
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    resourceType: 'Composition',
    section: [
      {
        code: {
          coding: [
            {
              code: '29545-1',
              display: 'Physical findings Narrative',
              system: 'http://loinc.org',
            },
          ],
        },
        entry: [
          {
            reference: 'Observation/0000000e-0000-4000-8000-00000000000e',
          },
          {
            reference: 'Observation/00000004-0000-4000-8000-000000000004',
          },
          {
            reference: 'Observation/00000010-0000-4000-8000-000000000010',
          },
        ],
        title: 'Pemeriksaan',
      },
      {
        code: {
          coding: [
            {
              code: '29308-4',
              display: 'Diagnosis',
              system: 'http://loinc.org',
            },
          ],
        },
        entry: [
          {
            reference: 'Condition/00000001-0000-4000-8000-000000000001',
          },
        ],
        title: 'Diagnosis',
      },
      {
        code: {
          coding: [
            {
              code: '29554-3',
              display: 'Procedure Narrative',
              system: 'http://loinc.org',
            },
          ],
        },
        entry: [
          {
            reference: 'Procedure/00000011-0000-4000-8000-000000000011',
          },
        ],
        title: 'Tindakan',
      },
      {
        code: {
          coding: [
            {
              code: '10160-0',
              display: 'History of Medication use Narrative',
              system: 'http://loinc.org',
            },
          ],
        },
        entry: [
          {
            reference: 'MedicationRequest/0000000f-0000-4000-8000-00000000000f',
          },
        ],
        title: 'Terapi',
      },
    ],
    status: 'final',
    subject: {
      display: 'Pasien Uji Sandbox',
      reference: 'Patient/P00000000000',
    },
    title: 'Resume Medis Rawat Jalan',
    type: {
      coding: [
        {
          code: '18842-5',
          display: 'Discharge summary',
          system: 'http://loinc.org',
        },
      ],
    },
  },
  Medication: {
    code: {
      coding: [
        {
          code: '93020847',
          display: 'Omeprazole',
          system: 'http://sys-ids.kemkes.go.id/kfa',
        },
      ],
    },
    extension: [
      {
        url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType',
        valueCodeableConcept: {
          coding: [
            {
              code: 'NC',
              display: 'Non-compound',
              system: 'http://terminology.kemkes.go.id/CodeSystem/medication-type',
            },
          ],
        },
      },
    ],
    id: '00000012-0000-4000-8000-000000000012',
    identifier: [
      {
        system: 'http://sys-ids.kemkes.go.id/medication/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        use: 'official',
        value: 'MED-OMEP-20',
      },
    ],
    meta: {
      lastUpdated: '2026-09-11T15:46:35.882229+00:00',
      versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA',
    },
    resourceType: 'Medication',
    status: 'active',
  },
} as const;

/**
 * The platform's answer to a read of an id it does not hold. Note that neither
 * `issue[0].code` (`no-store`) nor `details.text` (`storage_error`) says "not
 * found": a read-back check must key on the **HTTP 404**, never on these
 * strings. All eleven resource types we submit answer with this same shape.
 */
export const SATUSEHAT_READ_BACK_NOT_FOUND_FIXTURE = {
  issue: [
    {
      code: 'no-store',
      details: {
        text: 'storage_error',
      },
      diagnostics: 'resource not found: Condition/00000000-0000-4000-8000-000000000000',
      severity: 'error',
    },
  ],
  resourceType: 'OperationOutcome',
} as const;
