/**
 * Canonical examples for the room inventory and occupancy endpoints (IMP-13),
 * mirrored by `ApiEndpoint` into the OpenAPI document. Ward and room names are
 * the Indonesian flower/number convention most clinics actually use, so the
 * generated docs read like the screen they document.
 */
export const ROOM_MANAGEMENT_EXAMPLES = {
  paginationMeta: {
    page: 1,
    limit: 10,
    total: 1,
  },
  roomClass: {
    listItem: {
      id: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
      code: 'KELAS_1',
      name: 'Kelas 1',
      description: 'Kelas perawatan 1',
      quota: 12,
      allocatedBeds: 9,
      isActive: true,
      createdAt: '2026-09-05T01:55:00.000Z',
      updatedAt: '2026-09-05T01:55:00.000Z',
    },
    summary: {
      id: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
      code: 'KELAS_1',
      name: 'Kelas 1',
    },
    createRequest: {
      code: 'SUITE',
      name: 'Suite',
      description: 'Kamar suite dengan ruang tamu',
      quota: 2,
    },
    updateRequest: {
      name: 'Kelas 1 (AC)',
      quota: 14,
    },
  },
  ward: {
    listItem: {
      id: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
      code: 'MELATI',
      name: 'Bangsal Melati',
      description: 'Bangsal perawatan dewasa lantai 2',
      isActive: true,
      createdAt: '2026-09-05T02:00:00.000Z',
      updatedAt: '2026-09-05T02:00:00.000Z',
    },
    createRequest: {
      code: 'MELATI',
      name: 'Bangsal Melati',
      description: 'Bangsal perawatan dewasa lantai 2',
    },
    updateRequest: {
      name: 'Bangsal Melati (Lantai 2)',
      isActive: true,
    },
  },
  room: {
    listItem: {
      id: '2a3b4c5d-6e7f-4081-9203-b4c5d6e7f8a9',
      wardId: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
      ward: {
        id: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
        code: 'MELATI',
        name: 'Bangsal Melati',
      },
      roomClassId: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
      roomClass: {
        id: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
        code: 'KELAS_1',
        name: 'Kelas 1',
      },
      code: '201',
      name: 'Kamar 201',
      description: 'Dua tempat tidur, kamar mandi dalam',
      isActive: true,
      createdAt: '2026-09-05T02:05:00.000Z',
      updatedAt: '2026-09-05T02:05:00.000Z',
    },
    createRequest: {
      wardId: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
      roomClassId: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
      code: '201',
      name: 'Kamar 201',
    },
    updateRequest: {
      roomClassId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    },
  },
  bed: {
    listItem: {
      id: '3b4c5d6e-7f80-4192-a314-c5d6e7f8a9b0',
      roomId: '2a3b4c5d-6e7f-4081-9203-b4c5d6e7f8a9',
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
      code: 'A',
      status: 'AVAILABLE',
      notes: 'Dekat jendela',
      createdAt: '2026-09-05T02:10:00.000Z',
      updatedAt: '2026-09-05T02:10:00.000Z',
    },
    createRequest: {
      roomId: '2a3b4c5d-6e7f-4081-9203-b4c5d6e7f8a9',
      code: 'A',
    },
    updateRequest: {
      status: 'MAINTENANCE',
      notes: 'Perbaikan rangka tempat tidur',
    },
  },
  occupancy: {
    ward: {
      wardId: '1f2e3d4c-5b6a-4798-8069-a1b2c3d4e5f6',
      code: 'MELATI',
      name: 'Bangsal Melati',
      totalBeds: 4,
      availableBeds: 2,
      occupiedBeds: 1,
      maintenanceBeds: 1,
      rooms: [
        {
          roomId: '2a3b4c5d-6e7f-4081-9203-b4c5d6e7f8a9',
          code: '201',
          name: 'Kamar 201',
          roomClass: {
            id: '0e1f2a3b-4c5d-4e6f-8a90-b1c2d3e4f5a6',
            code: 'KELAS_1',
            name: 'Kelas 1',
          },
          totalBeds: 4,
          availableBeds: 2,
          occupiedBeds: 1,
          maintenanceBeds: 1,
        },
      ],
    },
  },
} as const;
