/**
 * Response examples for the in-app notification feed (IMP-21). Every value is
 * invented; the `params` shown carry a fictional doctor because that is the
 * only kind of value the real payloads carry — rendered copy never leaves the
 * frontend's message catalogs.
 */
export const NOTIFICATION_EXAMPLES = {
  notification: {
    id: 'f2a61c58-9d04-4e3b-8b72-5c1e0a9d7f26',
    type: 'APPOINTMENT_APPROVED',
    titleKey: 'appointmentApproved.title',
    bodyKey: 'appointmentApproved.body',
    params: { doctorName: 'dr. Ratna Dewi, Sp.PD' },
    href: null,
    readAt: null,
    createdAt: '2026-08-26T03:12:00.000Z',
  },
  readNotification: {
    id: 'b7e94d20-1f6a-4c85-9a03-6d2b8e4c1a57',
    type: 'CONVERSATION_HANDOFF',
    titleKey: 'conversationHandoff.title',
    bodyKey: 'conversationHandoff.body',
    params: { channel: 'TELEGRAM' },
    href: '/admin/conversations',
    readAt: '2026-08-26T04:02:00.000Z',
    createdAt: '2026-08-26T03:41:00.000Z',
  },
  paginationMeta: {
    page: 1,
    limit: 10,
    total: 2,
  },
  unreadCount: {
    unreadCount: 1,
  },
  readAll: {
    updatedCount: 3,
  },
} as const;
