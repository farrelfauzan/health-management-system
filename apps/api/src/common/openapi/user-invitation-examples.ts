/**
 * Response examples for staff email invitations (IMP-23). Every value is
 * invented. No example anywhere in this file carries a token or a token hash:
 * the raw token exists once, in the emailed link, and a documented sample of
 * one is an invitation to paste a real one into a support ticket.
 */
export const USER_INVITATION_EXAMPLES = {
  pending: {
    id: '0f9a4c31-2b7e-4d58-9c16-8ea3f5d0b742',
    email: 'siti.rahayu@example.com',
    status: 'PENDING',
    roles: [{ code: 'NURSE', name: 'Perawat' }],
    invitedByEmail: 'admin@salingjaga.com',
    expiresAt: '2026-08-29T04:00:00.000Z',
    createdAt: '2026-08-26T04:00:00.000Z',
    consumedAt: null,
    revokedAt: null,
  },
  revoked: {
    id: '6c81de07-5a34-4f92-b0d8-1e73a9c4f6b5',
    email: 'budi.santoso@example.com',
    status: 'REVOKED',
    roles: [{ code: 'RECEPTIONIST', name: 'Resepsionis' }],
    invitedByEmail: 'admin@salingjaga.com',
    expiresAt: '2026-08-29T02:15:00.000Z',
    createdAt: '2026-08-26T02:15:00.000Z',
    consumedAt: null,
    revokedAt: '2026-08-26T06:41:00.000Z',
  },
  createRequest: {
    email: 'siti.rahayu@example.com',
    roleCodes: ['NURSE'],
  },
  acceptRequest: {
    password: 'kunci-anggrek-lembayung',
  },
  preview: {
    email: 'siti.rahayu@example.com',
    expiresAt: '2026-08-29T04:00:00.000Z',
  },
  accepted: {
    email: 'siti.rahayu@example.com',
  },
  paginationMeta: {
    page: 1,
    limit: 10,
    total: 2,
  },
} as const;
