/**
 * Response examples for the doctor credential catalog (P19-T14) — the titles,
 * degrees and education fields of study a doctor's printed credentials are
 * picked from.
 *
 * The codes below are the real seeded ones on purpose: they are public master
 * data with no clinic-specific meaning, and an example that invented a code
 * would teach an integrator to send one the API rejects.
 */
export const DOCTOR_CREDENTIAL_OPTION_EXAMPLES = {
  title: {
    id: 'b0f2b1a4-6d1e-4d9a-9a7a-0f5c2f3d8e11',
    kind: 'TITLE',
    code: 'DR',
    label: 'dr.',
    sortOrder: 10,
    isActive: true,
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
  },
  degree: {
    id: 'c7a3d0e5-2b48-4c60-8f19-6d3a1b7e4c22',
    kind: 'DEGREE',
    code: 'SP_PD',
    label: 'Sp.PD',
    sortOrder: 100,
    isActive: true,
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
  },
  createRequest: {
    kind: 'DEGREE',
    code: 'SP_GK',
    label: 'Sp.GK',
    sortOrder: 270,
  },
  updateRequest: {
    label: 'Sp.G.K.',
    sortOrder: 275,
    isActive: false,
  },
} as const;
