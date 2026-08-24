/**
 * Canonical examples for the admission endpoints (IMP-14), mirrored by
 * `ApiEndpoint` into the OpenAPI document. The bed, room and ward ids match
 * `ROOM_MANAGEMENT_EXAMPLES`, so the two sets of docs describe one clinic.
 */
const BED_EXAMPLE = {
  id: '3b4c5d6e-7f80-4192-a314-c5d6e7f8a9b0',
  code: 'A',
  room: {
    id: '2a3b4c5d-6e7f-4081-9203-b4c5d6e7f8a9',
    code: '201',
    name: 'Kamar 201',
    roomClass: {
      id: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
      code: 'KELAS_1',
      name: 'Kelas 1',
    },
  },
  ward: {
    id: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
    code: 'MELATI',
    name: 'Bangsal Melati',
  },
};

export const ADMISSION_FLOW_EXAMPLES = {
  paginationMeta: {
    page: 1,
    limit: 10,
    total: 1,
  },
  admission: {
    listItem: {
      id: '4c5d6e7f-8091-42a3-b425-d6e7f8a9b0c1',
      patientId: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
      patient: {
        id: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
        mrn: 'RM-000123',
        fullName: 'Budi Santoso',
      },
      admittingDoctorId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      admittingDoctor: {
        id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        fullName: 'dr. Siti Rahayu, Sp.PD',
      },
      sourceEncounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
      status: 'ADMITTED',
      reason: 'Demam berdarah, trombosit menurun',
      admittedAt: '2026-09-05T03:00:00.000Z',
      currentBed: BED_EXAMPLE,
      bedAssignments: [
        {
          id: '5d6e7f80-9102-43b4-8536-e7f8a9b0c1d2',
          bed: BED_EXAMPLE,
          startedAt: '2026-09-05T03:00:00.000Z',
        },
      ],
      createdAt: '2026-09-05T03:00:00.000Z',
      updatedAt: '2026-09-05T03:00:00.000Z',
    },
    admitRequest: {
      patientId: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
      admittingDoctorId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      bedId: '3b4c5d6e-7f80-4192-a314-c5d6e7f8a9b0',
      sourceEncounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
      reason: 'Demam berdarah, trombosit menurun',
    },
    transferRequest: {
      bedId: '6e7f8091-0213-44c5-9647-f8a9b0c1d2e3',
    },
    dischargeRequest: {
      dischargeSummary: 'Trombosit stabil, pasien dipulangkan dengan obat oral.',
    },
    cancelRequest: {
      reason: 'Dibuat pada pasien yang salah',
    },
    updateRequest: {
      reason: 'Demam berdarah dengue grade II',
    },
  },
} as const;
