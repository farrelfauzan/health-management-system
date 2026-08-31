import { optionalExample } from './api-endpoint.decorator';

/**
 * Response and request examples for the admin half of the WhatsApp/Telegram
 * channel (`PCS-T08`).
 *
 * Every value is invented. That matters more here than on most surfaces: these
 * examples are rendered in public API docs, and this is the one module whose
 * real payloads carry members of the public writing to a clinic — so the chat
 * ids, the names, and the transcript lines are all fictional, and no example
 * shows an identifier the channel is forbidden from collecting in the first
 * place (§5.3).
 */
export const CUSTOMER_SERVICE_ADMIN_EXAMPLES = {
  conversation: {
    id: 'a4d1f0b2-6c3e-4f79-9a10-2b8d5c7e1f34',
    channel: 'TELEGRAM',
    externalChatId: '184920371',
    senderDisplayName: 'Rina',
    state: 'NEEDS_HUMAN',
    isBlocked: false,
    blockedAt: null,
    waitingForSeconds: 412,
    messageCount: 14,
    lastMessageAt: '2026-08-09T02:41:00.000Z',
    createdAt: '2026-08-09T02:18:00.000Z',
  },
  blockedConversation: {
    id: 'c9b7e21a-5d40-4b8a-8f21-0a6c3d9e4b57',
    channel: 'TELEGRAM',
    externalChatId: '772310884',
    senderDisplayName: null,
    state: 'BOT_ACTIVE',
    isBlocked: true,
    blockedAt: '2026-08-08T11:02:00.000Z',
    waitingForSeconds: null,
    messageCount: 231,
    lastMessageAt: '2026-08-08T11:01:00.000Z',
    createdAt: '2026-08-08T09:55:00.000Z',
  },
  handoffSummary: {
    needsHumanCount: 3,
    humanActiveCount: 1,
    oldestWaitingSince: '2026-08-09T02:34:00.000Z',
  },
  customerMessage: {
    id: 'd7f4a913-2b58-4c0e-b6a7-91e0c4d3f228',
    role: 'CUSTOMER',
    content: 'Halo, saya mau tanya jam praktik dokter umum hari Sabtu',
    authorUserId: null,
    authorEmail: null,
    safetyTags: [],
    createdAt: '2026-08-09T02:34:00.000Z',
  },
  adminMessage: {
    id: 'e1a90c47-73f2-4de6-8b15-6c2f0a8d95b3',
    role: 'ADMIN',
    content: 'Selamat siang Bu Rina, dokter umum praktik Sabtu pukul 08.00–12.00.',
    authorUserId: '5b2c8f01-9d3a-4e67-a1c0-7f4b6e2d8039',
    authorEmail: 'admin@salingjaga.com',
    safetyTags: [],
    createdAt: '2026-08-09T02:42:00.000Z',
  },
  replyRequest: {
    text: 'Selamat siang Bu Rina, dokter umum praktik Sabtu pukul 08.00–12.00.',
  },
  blockRequest: {
    reason: 'Pesan berulang otomatis, 200+ dalam satu jam',
  },
  arrival: {
    appointmentId: 'f3c8b0d5-41e7-4a92-9b6d-8e05c7a2f194',
    bookingReferenceCode: 'SJ-7QK4M2',
    channel: 'TELEGRAM',
    scheduledAt: '2026-08-09T01:00:00.000Z',
    appointmentStatus: 'SCHEDULED',
    doctorName: 'dr. Andi Pratama',
    specialty: optionalExample('Dokter Umum'),
    // Two shapes of booking share this worklist until `P17-T05` drains the old
    // ones (`P17-T03`). This row is a legacy draft profile, which has a patient
    // id and an MRN already spent on it; a prospective booking has neither and
    // carries `prospectivePatientId` instead — so all three are optional.
    subjectKind: 'PATIENT',
    patientId: optionalExample('6d90a1c3-2f84-4b57-8e10-3c7f5a9d0b28'),
    patientMrn: optionalExample('RM-000482'),
    prospectivePatientId: optionalExample('9a1b2c3d-4e5f-4061-8a72-b3c4d5e6f708'),
    patientFullName: 'Rina Kusuma',
    patientPhoneNumber: '628123456789',
    patientIsDraft: true,
    missingFields: ['dateOfBirth', 'address', 'nik'],
    createdAt: '2026-08-08T14:22:00.000Z',
  },
  metrics: {
    from: '2026-07-26',
    to: '2026-08-09',
    windowDays: 14,
    inboundMessages: 412,
    messagesPerDay: 29.4,
    conversationsStarted: 96,
    intentMix: { search_faq: 88, list_available_sessions: 41, book_appointment: 23 },
    bookingsConfirmed: 23,
    bookingConversion: 0.24,
    handoffs: 7,
    handoffRate: 0.073,
    faqSearches: 88,
    faqNoHits: 11,
    faqNoHitRate: 0.125,
    rateLimitedTurns: 3,
    budgetExhaustedTurns: 0,
    enumerationFlags: 0,
    blockedConversations: 1,
  },
  mergeCandidate: {
    id: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
    mrn: 'RM-000119',
    fullName: 'Rina Kusumawardani',
    phoneNumber: '628123456789',
    dateOfBirth: optionalExample('1991-03-14'),
  },
  mergeRequest: {
    targetPatientId: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
  },
  merge: {
    draftPatientId: '6d90a1c3-2f84-4b57-8e10-3c7f5a9d0b28',
    targetPatientId: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
    movedAppointments: 1,
    movedRegistrations: 0,
    movedChannelLinks: 1,
  },
  prospectivePatient: {
    id: '9a1b2c3d-4e5f-4061-8a72-b3c4d5e6f708',
    fullName: 'Siti Rahayu',
    phoneNumber: '628123456789',
    channel: 'TELEGRAM',
    status: 'AWAITING_ARRIVAL',
    patientId: optionalExample('6d90a1c3-2f84-4b57-8e10-3c7f5a9d0b28'),
    openAppointments: 1,
    expiresAt: '2026-11-06T14:22:00.000Z',
    createdAt: '2026-08-08T14:22:00.000Z',
  },
  prospectiveMatchCandidate: {
    id: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
    mrn: 'RM-000119',
    fullName: 'Siti Rahayu Wulandari',
    phoneNumber: '628123456789',
    dateOfBirth: optionalExample('1991-03-14'),
    // Last four digits only, and only so the clerk can check them against the
    // card. Reading a NIK back out is the patient-edit screen's audited job.
    nikMasked: optionalExample('••••••••3271'),
    score: 71,
    reasons: ['PHONE_EXACT', 'NAME_SIMILAR'],
  },
  prospectiveLinkRequest: {
    patientId: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
  },
  prospectiveLink: {
    prospectivePatientId: '9a1b2c3d-4e5f-4061-8a72-b3c4d5e6f708',
    resolution: 'LINKED',
    patientId: '2a7f4b91-0c86-4d3e-9f52-1b8c6a0e4d77',
    mrn: 'RM-000119',
    patientFullName: 'Siti Rahayu Wulandari',
    movedAppointments: 1,
  },
  prospectiveConversion: {
    prospectivePatientId: '9a1b2c3d-4e5f-4061-8a72-b3c4d5e6f708',
    resolution: 'CONVERTED',
    patientId: 'c41d8f6a-72b5-4e39-90a1-5d2e7c8b4f60',
    // Allocated by this request, and by nothing else in the system.
    mrn: 'RM-000483',
    patientFullName: 'Siti Rahayu',
    movedAppointments: 1,
  },
} as const;
