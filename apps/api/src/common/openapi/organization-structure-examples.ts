import { optionalExample } from './api-endpoint.decorator';

/**
 * Canonical org-chart payloads for the generated OpenAPI document (SJ-1).
 *
 * The tree example is two levels deep on purpose: `ApiEndpoint` infers the
 * response schema from the example, and a one-level example would document
 * `children` as an array of nothing, which the frontend's generated types then
 * enforce.
 */
export const ORGANIZATION_STRUCTURE_EXAMPLES = {
  unit: {
    id: '6f3a1b2c-9d4e-4f8a-b1c2-3d4e5f6a7b8c',
    parentId: null,
    name: 'Clinical Services',
    kind: 'DIVISION',
    depth: 1,
    sortOrder: 0,
    memberCount: 4,
    createdAt: '2026-09-08T02:15:00.000Z',
    updatedAt: '2026-09-08T02:15:00.000Z',
  },
  tree: {
    roots: [
      {
        id: '6f3a1b2c-9d4e-4f8a-b1c2-3d4e5f6a7b8c',
        parentId: null,
        name: 'Clinical Services',
        kind: 'DIVISION',
        depth: 1,
        sortOrder: 0,
        memberCount: 4,
        createdAt: '2026-09-08T02:15:00.000Z',
        updatedAt: '2026-09-08T02:15:00.000Z',
        children: [
          {
            id: '8a1c4d5e-2b3f-4a6c-9d8e-7f0a1b2c3d4e',
            parentId: '6f3a1b2c-9d4e-4f8a-b1c2-3d4e5f6a7b8c',
            name: 'Nursing',
            kind: 'DEPARTMENT',
            depth: 2,
            sortOrder: 0,
            memberCount: 11,
            createdAt: '2026-09-08T02:16:00.000Z',
            updatedAt: '2026-09-08T02:16:00.000Z',
            children: [],
          },
        ],
      },
    ],
    totalUnits: 2,
    maxDepth: 2,
  },
  createRequest: {
    name: 'Nursing',
    kind: 'DEPARTMENT',
    parentId: '6f3a1b2c-9d4e-4f8a-b1c2-3d4e5f6a7b8c',
    sortOrder: 0,
  },
  updateRequest: {
    name: 'Nursing & Midwifery',
    sortOrder: 1,
  },
  moveRequest: {
    parentId: '8a1c4d5e-2b3f-4a6c-9d8e-7f0a1b2c3d4e',
    sortOrder: 0,
  },
  member: {
    userId: 'c7e1f2a3-4b5c-4d6e-8f90-1a2b3c4d5e6f',
    // Optional in the schema, not just in this example: only accounts owning a
    // DoctorProfile carry a name, so an administrator's row omits it entirely.
    fullName: optionalExample('dr. Maya Sari, Sp.A'),
    email: 'maya.sari@clinic.local',
    isActive: true,
    roles: ['DOCTOR'],
  },
  memberListMeta: {
    page: 1,
    limit: 20,
    total: 11,
  },
} as const;
