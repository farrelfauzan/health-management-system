import { optionalExample } from './api-endpoint.decorator';

const patientId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const appointmentId = '44444444-4444-4444-8444-444444444444';
const registrationId = '55555555-5555-4555-8555-555555555555';
const medicationId = '66666666-6666-4666-8666-666666666666';
const prescriptionId = '77777777-7777-4777-8777-777777777777';
const assignmentId = '88888888-8888-4888-8888-888888888888';
const timestamp = '2026-07-20T08:00:00.000Z';
const paginationMeta = { page: 1, limit: 10, total: 1 };
// Synthetic identifiers only — never a real NIK or BPJS number. This NIK is
// structurally consistent with the example patient: digits 7-12 encode
// DD+40 (female) / MM / YY for 1990-05-12.
const syntheticNik = '3201015205900001';
const syntheticBpjsNumber = '0001234567890';
const patient = {
  id: patientId,
  // Server-allocated: zero-padded to PATIENT_MRN_WIDTH, never client-supplied.
  mrn: '00000001',
  // A counter-created record: `CHANNEL_BOOKING` marks the chat-made drafts the
  // front desk still has to complete (`PCS-T07`).
  source: 'FRONT_DESK',
  fullName: 'Aisha Rahman',
  // Optional in the response, not in the example: a chat-created draft
  // (`source: CHANNEL_BOOKING`) carries a name and a phone number and nothing
  // else, because §5.3 forbids collecting the rest over an unauthenticated
  // channel. The front desk fills them in when the patient arrives.
  dateOfBirth: optionalExample('1990-05-12'),
  placeOfBirth: 'Bandung',
  sex: 'FEMALE',
  status: 'OUT_PATIENT',
  phoneNumber: '+628123456789',
  address: optionalExample('Jakarta'),
  nikMasked: '••••••••0001',
  bpjsNumberMasked: '••••••••7890',
  hasSatusehatPatientId: false,
  email: 'aisha.rahman@example.com',
  bloodType: 'O',
  rhesusFactor: 'POSITIVE',
  maritalStatus: 'MARRIED',
  occupation: 'Teacher',
  religion: 'ISLAM',
  emergencyContactName: 'Rahmat Rahman',
  emergencyContactPhone: '+628123456700',
  guardianName: 'Rahmat Rahman',
  guardianRelation: 'Spouse',
  ownerUserId: userId,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const patientAllergy = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  substance: 'Penicillin',
  reaction: 'Urticaria and swelling',
  severity: 'SEVERE',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const patientRelatedDoctor = {
  id: doctorId,
  assignmentId,
  fullName: 'Dr. Budi Santoso',
  specialty: 'Internal Medicine',
};
const doctorScheduleEntry = {
  id: '99999999-9999-4999-8999-999999999999',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '16:00',
  isAvailable: true,
};
const icd10Code = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  code: 'J06.9',
  display: 'Acute upper respiratory infection, unspecified',
  displayIndonesian: 'Infeksi saluran napas atas akut, tidak dijelaskan',
  category: 'J06',
  chapter: 'X',
  isActive: true,
};
const icd9cmCode = {
  id: 'ffffffff-ffff-4fff-8fff-fffffffffff9',
  code: '93.94',
  display: 'Respiratory medication administered by nebulizer',
  displayIndonesian: 'Pemberian obat pernapasan melalui nebulizer',
  category: '93',
  isActive: true,
};
const encounterId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const vitalSignsId = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const diagnosisId = 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const procedureId = 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const encounter = {
  id: encounterId,
  registrationId,
  patientId,
  doctorId,
  status: 'IN_PROGRESS',
  startedAt: timestamp,
  subjective: 'Batuk berdahak sejak 3 hari, demam ringan.',
  objective: 'Faring hiperemis, tidak ada ronki.',
  assessment: 'ISPA non-pneumonia.',
  plan: 'Simptomatik, kontrol bila demam menetap 3 hari.',
  createdById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const vitalSigns = {
  id: vitalSignsId,
  encounterId,
  heightCm: 162,
  weightKg: 58.4,
  systolicBloodPressure: 118,
  diastolicBloodPressure: 76,
  pulseRate: 84,
  respiratoryRate: 18,
  temperatureCelsius: 37.4,
  oxygenSaturation: 98,
  // Derived from the height and weight on this row, never stored.
  bodyMassIndex: 22.3,
  recordedAt: timestamp,
  recordedById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const diagnosis = {
  id: diagnosisId,
  encounterId,
  icd10CodeId: icd10Code.id,
  code: icd10Code.code,
  display: icd10Code.display,
  type: 'PRIMARY',
  recordedAt: timestamp,
  recordedById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const procedureRecord = {
  id: procedureId,
  encounterId,
  icd9cmCodeId: icd9cmCode.id,
  code: icd9cmCode.code,
  display: icd9cmCode.display,
  performedAt: timestamp,
  recordedById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const specialtyId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const specialty = {
  id: specialtyId,
  name: 'Internal Medicine',
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
// Synthetic practitioner NIK — digits 7-12 encode DD/MM/YY for a male doctor
// born 1980-03-15. Never a real NIK.
const syntheticDoctorNik = '3173011503800002';
const doctor = {
  id: doctorId,
  licenseNumber: 'SIP-2026-0001',
  fullName: 'Dr. Budi Santoso',
  specialtyId,
  specialty: specialty.name,
  phoneNumber: '+628129876543',
  email: 'budi.santoso@clinic.local',
  title: 'dr.',
  degrees: 'Sp.PD',
  nikMasked: '••••••••0002',
  satusehatPractitionerId: '10009880728',
  ownerUserId: userId,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const doctorLicenses = [
  {
    id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
    type: 'STR',
    licenseNumber: 'STR-33-2020-000123',
    issuedAt: '2020-02-01',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'dededede-dede-4ede-8ede-dededededede',
    type: 'SIP',
    licenseNumber: 'SIP-2026-0001',
    issuedAt: '2026-01-15',
    expiresAt: '2031-01-14',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
const doctorEducations = [
  {
    id: 'fafafafa-fafa-4afa-8afa-fafafafafafa',
    institution: 'Universitas Indonesia',
    degree: 'dr.',
    fieldOfStudy: 'Kedokteran',
    graduationYear: 2004,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'fbfbfbfb-fbfb-4bfb-8bfb-fbfbfbfbfbfb',
    institution: 'Universitas Indonesia',
    degree: 'Sp.PD',
    fieldOfStudy: 'Penyakit Dalam',
    graduationYear: 2010,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const appointment = {
  id: appointmentId,
  // Exactly one of the two is present (`P17-T02`), so neither is required:
  // a booking taken over chat before the person ever attended carries
  // `prospectivePatientId` and no `patientId`.
  patientId: optionalExample(patientId),
  prospectivePatientId: optionalExample('88888888-8888-4888-8888-888888888888'),
  doctorId,
  type: 'SESSION',
  sessionId,
  queueNumber: 3,
  scheduledAt: '2026-07-21T09:00:00.000Z',
  status: 'SCHEDULED',
  reason: 'Routine consultation',
  notes: 'First visit',
  createdById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const appointmentSession = {
  id: sessionId,
  scheduleId: '99999999-9999-4999-8999-999999999999',
  doctorId,
  sessionDate: '2026-07-27',
  startTime: '08:00',
  endTime: '12:00',
  status: 'OPEN',
  maxPatients: 10,
  bookedCount: 3,
  remaining: 7,
  // P16-T20. Present only for a caller who may already read the clinic's
  // licence expiry roster, and **absent** — not empty — for everyone else,
  // including the patient portal. An empty array says "this doctor's permits
  // are current"; an absent field says "you are not being told about
  // licences", and those are different facts.
  expiredLicenses: [],
};
const registration = {
  id: registrationId,
  patientId,
  appointmentId,
  status: 'REGISTERED',
  // Server-allocated daily antrian tickets, never client-supplied: one from
  // the clinic-wide roll, one from the poli's own sequence (P14-T01).
  queueNumber: 1,
  queueDate: '2026-07-20',
  poliQueueNumber: 1,
  poli: { id: specialtyId, name: 'Internal Medicine' },
  registeredAt: timestamp,
  createdById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
};
// Synthetic KFA code: structurally valid (numeric) but not a real Kemenkes
// catalog entry.
const kfaCode = '93000001';

const medication = {
  id: medicationId,
  code: 'MED-PARA-500',
  kfaCode,
  name: 'Paracetamol',
  form: 'Tablet',
  strength: '500 mg',
  unit: 'TABLET',
  category: 'OBAT_BEBAS',
  stockQty: 250,
  reorderLevel: 50,
  needsReorder: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const medicationCreateRequest = {
  code: 'MED-PARA-500',
  kfaCode,
  name: 'Paracetamol',
  form: 'Tablet',
  strength: '500 mg',
  unit: 'TABLET',
  category: 'OBAT_BEBAS',
  reorderLevel: 50,
};

const medicationUpdateRequest = {
  name: 'Paracetamol 500 mg',
  category: 'OBAT_BEBAS',
  reorderLevel: 75,
};

export const PHASE_THREE_EXAMPLES = {
  auth: {
    loginRequest: {
      email: 'admin@example.com',
      password: 'SecurePassword123!',
    },
    // SJ-6: refresh and logout take no body. The refresh token travels only
    // as an httpOnly cookie, so there is nothing for a client to send or read.
    tokens: {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.access.example',
      tokenType: 'Bearer',
      expiresIn: '15m',
    },
    logoutResult: {
      success: true,
      message: 'Logged out',
    },
    // SJ-8: login has three outcomes. Exactly one of `tokens` and `mfaTicket`
    // is present, decided by `status` — both are optional in the schema for
    // that reason, and a client must branch rather than reach for `tokens`.
    loginResult: {
      status: 'AUTHENTICATED',
      tokens: optionalExample({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.access.example',
        tokenType: 'Bearer',
        expiresIn: '15m',
      }),
      mfaTicket: optionalExample({
        ticket: 'eyJhbGciOiJIUzI1NiJ9.mfa-pending.example',
        expiresIn: '120s',
      }),
      mfaEnrolmentRequired: optionalExample(false),
      mfaEnrolmentDeadline: optionalExample('2026-09-01T00:00:00.000Z'),
    },
    mfaEnrolment: {
      otpauthUri:
        'otpauth://totp/HMS%20Clinic:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=HMS%20Clinic',
      secret: 'JBSWY3DPEHPK3PXP',
    },
    mfaEnrolmentCompleted: {
      recoveryCodes: ['3k9mp-x2vtr-8hnqz', 'b7wdf-4jkm2-ptxs9'],
      tokens: optionalExample({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.access.example',
        tokenType: 'Bearer',
        expiresIn: '15m',
      }),
    },
    mfaRecoveryCodes: {
      recoveryCodes: ['3k9mp-x2vtr-8hnqz', 'b7wdf-4jkm2-ptxs9'],
    },
    mfaStatus: {
      enrolled: true,
      required: true,
      enrolledAt: optionalExample(timestamp),
      unusedRecoveryCodeCount: 9,
      enrolmentDeadline: optionalExample('2026-09-01T00:00:00.000Z'),
    },
    mfaVerifyRequest: {
      code: '123456',
    },
    mfaChallengeRequest: {
      code: '123456',
    },
    mfaResetRequest: {
      userId,
      actorCode: '123456',
      reason: 'Lost phone, identity confirmed in person',
    },
    mfaResetResult: {
      success: true,
      message: 'Second factor reset',
    },
    // SJ-9: the browser reads its countdown from here rather than hard-coding
    // it, so a clinic that changes the threshold does not end up with a
    // warning modal that fires at the wrong moment.
    sessionHeartbeat: {
      alive: true,
      idleTimeoutSeconds: 900,
      warningLeadSeconds: 60,
    },
  },
  rbac: {
    roleItem: {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      code: 'ADMIN',
      name: 'Administrator',
      description: optionalExample('Clinic administrator'),
      isSystem: true,
      memberCount: 3,
    },
    customRoleItem: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      code: 'FRONT_DESK_LEAD',
      name: 'Front Desk Lead',
      description: optionalExample('Registration desk supervisor'),
      isSystem: false,
    },
    createRoleRequest: {
      code: 'FRONT_DESK_LEAD',
      name: 'Front Desk Lead',
      description: 'Registration desk supervisor',
    },
    updateRoleRequest: {
      name: 'Front Desk Lead',
      description: 'Registration desk supervisor',
    },
    permissionItem: {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      permissionKey: 'patient.read:any',
      resource: 'Patient',
      action: 'read',
      scope: 'ANY',
      description: optionalExample('Read all patients'),
    },
    permissionGroup: {
      resource: 'Patient',
      permissions: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          permissionKey: 'patient.read:any',
          resource: 'Patient',
          action: 'read',
          scope: 'ANY',
          description: optionalExample('Read all patients'),
        },
      ],
    },
    roleDetail: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      code: 'FRONT_DESK_LEAD',
      name: 'Front Desk Lead',
      description: optionalExample('Registration desk supervisor'),
      isSystem: false,
      memberCount: 2,
      permissions: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          permissionKey: 'patient.read:any',
          resource: 'Patient',
          action: 'read',
          scope: 'ANY',
          description: optionalExample('Read all patients'),
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    setRolePermissionsRequest: {
      permissionKeys: ['patient.read:any', 'appointment.read:any'],
    },
    roleDeletion: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      code: 'FRONT_DESK_LEAD',
      deletedAt: timestamp,
      revokedAssignmentCount: 2,
    },
    assignRequest: {
      userId,
      roleCode: 'ADMIN',
    },
    assignment: {
      id: 'abababab-abab-4bab-8bab-abababababab',
      userId,
      roleId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      assignedAt: timestamp,
    },
    unassignment: {
      id: 'abababab-abab-4bab-8bab-abababababab',
      userId,
      roleId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      unassignedAt: timestamp,
    },
  },
  health: {
    status: {
      status: 'ok',
      service: 'api',
    },
  },
  admin: {
    createRequest: {
      email: 'admin@example.com',
      password: 'SecurePassword123!',
      roleCodes: ['ADMIN'],
      isActive: true,
    },
    updateRequest: {
      isActive: false,
      roleCodes: ['ADMIN'],
    },
    item: {
      id: userId,
      // SJ-89. Optional in the schema, not merely absent from this example:
      // `users` has no name column, so only an account owning a DoctorProfile
      // resolves to one and an administrator's row omits it entirely.
      fullName: optionalExample('dr. Maya Sari, Sp.A'),
      email: 'admin@example.com',
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      roles: [{ code: 'ADMIN', name: 'Administrator' }],
    },
  },
  patient: {
    createRequest: {
      fullName: 'Aisha Rahman',
      dateOfBirth: '1990-05-12',
      placeOfBirth: 'Bandung',
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '+628123456789',
      address: 'Jakarta',
      nik: syntheticNik,
      bpjsNumber: syntheticBpjsNumber,
      email: 'aisha.rahman@example.com',
      bloodType: 'O',
      rhesusFactor: 'POSITIVE',
      maritalStatus: 'MARRIED',
      occupation: 'Teacher',
      religion: 'ISLAM',
      emergencyContactName: 'Rahmat Rahman',
      emergencyContactPhone: '+628123456700',
      allergies: [{ substance: 'Penicillin', reaction: 'Urticaria and swelling', severity: 'SEVERE' }],
      ownerUserId: userId,
      doctorIds: [doctorId],
    },
    // Legacy migration only: the MRN is already printed on a physical folder,
    // so it is accepted verbatim instead of being allocated.
    importRequest: {
      mrn: 'RM-2019-0417',
      fullName: 'Aisha Rahman',
      dateOfBirth: '1990-05-12',
      sex: 'FEMALE',
      phoneNumber: '+628123456789',
      address: 'Jakarta',
      nik: syntheticNik,
    },
    updateRequest: {
      phoneNumber: '+628123456780',
      address: 'Bandung',
      status: 'IN_PATIENT',
      allergies: [{ substance: 'Penicillin', severity: 'MODERATE' }],
    },
    mutationMeta: { identifierWarnings: [] },
    identifiers: {
      id: patientId,
      mrn: patient.mrn,
      nik: syntheticNik,
      bpjsNumber: syntheticBpjsNumber,
    },
    item: patient,
    listItem: {
      ...patient,
      doctorCount: 1,
      allergyCount: 1,
      doctors: [patientRelatedDoctor],
    },
    detail: {
      ...patient,
      doctors: [patientRelatedDoctor],
      allergies: [patientAllergy],
    },
  },
  specialty: {
    item: specialty,
  },
  terminology: {
    icd10Code,
    icd9cmCode,
  },
  doctor: {
    createRequest: {
      licenseNumber: 'SIP-2026-0001',
      fullName: 'Dr. Budi Santoso',
      specialtyId,
      phoneNumber: '+628129876543',
      email: 'budi.santoso@clinic.local',
      title: 'dr.',
      degrees: 'Sp.PD',
      nik: syntheticDoctorNik,
      licenses: [
        { type: 'STR', licenseNumber: 'STR-33-2020-000123', issuedAt: '2020-02-01' },
        {
          type: 'SIP',
          licenseNumber: 'SIP-2026-0001',
          issuedAt: '2026-01-15',
          expiresAt: '2031-01-14',
        },
      ],
      educations: [
        {
          institution: 'Universitas Indonesia',
          degree: 'dr.',
          fieldOfStudy: 'Kedokteran',
          graduationYear: 2004,
        },
        {
          institution: 'Universitas Indonesia',
          degree: 'Sp.PD',
          fieldOfStudy: 'Penyakit Dalam',
          graduationYear: 2010,
        },
      ],
      ownerUserId: userId,
      patientIds: [patientId],
    },
    updateRequest: {
      specialtyId,
      phoneNumber: '+628129876500',
      email: 'budi.santoso@clinic.local',
      title: 'dr.',
      degrees: 'Sp.PD',
      isActive: true,
    },
    scheduleRequest: {
      schedules: [
        {
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '16:00',
          isAvailable: true,
        },
      ],
    },
    identifiers: {
      id: doctorId,
      nik: syntheticDoctorNik,
    },
    item: doctor,
    listItem: { ...doctor, patientCount: 1, schedules: [doctorScheduleEntry] },
    detail: {
      ...doctor,
      patientCount: 1,
      schedules: [doctorScheduleEntry],
      licenses: doctorLicenses,
      educations: doctorEducations,
      patients: [
        { id: patientId, assignmentId, mrn: patient.mrn, fullName: patient.fullName },
      ],
    },
  },
  assignment: {
    createRequest: { doctorId, patientId },
    item: {
      id: assignmentId,
      doctorId,
      patientId,
      assignedById: userId,
      assignedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    activity: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      assignmentId,
      doctorId,
      patientId,
      action: 'ASSIGNED',
      actorUserId: userId,
      occurredAt: timestamp,
    },
  },
  appointment: {
    createRequest: {
      type: 'SESSION',
      patientId,
      doctorId,
      scheduleId: '99999999-9999-4999-8999-999999999999',
      sessionDate: '2026-07-27',
      reason: 'Routine consultation',
      notes: 'First visit',
    },
    createSpecialRequest: {
      type: 'SPECIAL_REQUEST',
      patientId,
      doctorId,
      requestedAt: '2026-07-21T09:00:00+07:00',
      reason: 'Needs a longer consultation slot',
    },
    approveRequest: { scheduledAt: '2026-07-21T10:00:00+07:00' },
    rejectRequest: { reason: 'Doctor is unavailable outside practice hours' },
    updateRequest: {
      scheduledAt: '2026-07-21T10:00:00+07:00',
      status: 'CONFIRMED',
    },
    cancelRequest: { reason: 'Patient requested cancellation' },
    item: appointment,
    listItem: {
      ...appointment,
      subject: {
        kind: 'PATIENT',
        id: patientId,
        // Absent when `kind` is PROSPECTIVE_PATIENT: no MRN has been spent yet.
        mrn: optionalExample(patient.mrn),
        fullName: patient.fullName,
      },
      doctor: {
        id: doctorId,
        fullName: doctor.fullName,
        specialty: doctor.specialty,
      },
    },
    session: appointmentSession,
    sessionQueue: {
      session: appointmentSession,
      queue: [
        {
          appointmentId,
          queueNumber: 3,
          status: 'SCHEDULED',
          reason: 'Routine consultation',
          subject: {
            kind: 'PATIENT',
            id: patientId,
            mrn: optionalExample(patient.mrn),
            fullName: patient.fullName,
          },
        },
        {
          appointmentId: '77777777-7777-4777-8777-777777777777',
          queueNumber: 4,
          status: 'SCHEDULED',
          reason: 'Booked over WhatsApp, has not arrived yet',
          // The other half of the dual key (`P17-T02`): a booking for someone
          // who is not a patient yet, so there is no MRN to show and the
          // counter must search the registry before registering them.
          subject: {
            kind: 'PROSPECTIVE_PATIENT',
            id: '88888888-8888-4888-8888-888888888888',
            fullName: 'Siti Rahayu',
          },
        },
      ],
    },
    sessionUpdateRequest: { maxPatients: 15, status: 'CLOSED' },
  },
  registration: {
    createRequest: { patientId, appointmentId },
    updateRequest: { status: 'CHECKED_IN' },
    item: registration,
    listItem: {
      ...registration,
      patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
      appointment: {
        id: appointmentId,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        doctor: { id: doctorId, fullName: doctor.fullName, specialty: doctor.specialty },
      },
    },
    queueBoard: {
      date: '2026-07-20',
      counts: { pending: 0, checkedIn: 1, completed: 0, cancelled: 0 },
      poli: [
        {
          poli: { id: specialtyId, name: specialty.name },
          waiting: 1,
          counts: { pending: 0, checkedIn: 1, completed: 0, cancelled: 0 },
          lastIssuedNumber: 1,
        },
      ],
      entries: [
        {
          registrationId,
          queueNumber: 1,
          poliQueueNumber: 1,
          poli: { id: specialtyId, name: specialty.name },
          status: 'CHECKED_IN',
          registeredAt: timestamp,
          checkedInAt: timestamp,
          patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
          doctor: { id: doctorId, fullName: doctor.fullName, specialty: doctor.specialty },
        },
      ],
    },
  },
  encounter: {
    openRequest: { registrationId, doctorId },
    soapRequest: {
      subjective: 'Batuk berdahak sejak 3 hari, demam ringan.',
      objective: 'Faring hiperemis, tidak ada ronki.',
      assessment: 'ISPA non-pneumonia.',
      plan: 'Simptomatik, kontrol bila demam menetap 3 hari.',
    },
    vitalSignsRequest: {
      heightCm: 162,
      weightKg: 58.4,
      systolicBloodPressure: 118,
      diastolicBloodPressure: 76,
      pulseRate: 84,
      respiratoryRate: 18,
      temperatureCelsius: 37.4,
      oxygenSaturation: 98,
    },
    diagnosisRequest: { icd10CodeId: icd10Code.id, type: 'PRIMARY' },
    procedureRequest: { icd9cmCodeId: icd9cmCode.id },
    vitalSigns,
    diagnosis,
    procedure: procedureRecord,
    listItem: {
      ...encounter,
      patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
      doctor: {
        id: doctorId,
        licenseNumber: doctor.licenseNumber,
        fullName: doctor.fullName,
        satusehatReportable: true,
      },
      vitalSignsCount: 1,
      diagnosisCount: 1,
      procedureCount: 1,
    },
    detail: {
      ...encounter,
      patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
      doctor: {
        id: doctorId,
        licenseNumber: doctor.licenseNumber,
        fullName: doctor.fullName,
        satusehatReportable: true,
      },
      vitalSigns: [vitalSigns],
      diagnoses: [diagnosis],
      procedures: [procedureRecord],
      prescriptions: [{ id: prescriptionId, status: 'ISSUED', issuedAt: timestamp, itemCount: 1 }],
    },
  },
  pharmacy: {
    medication,
    medicationCreateRequest,
    medicationUpdateRequest,
    stockReceiptRequest: {
      medicationId,
      batchNumber: 'LOT-PARA-2026-07',
      expiryDate: '2028-07-31',
      quantity: 250,
      receivedAt: timestamp,
      notes: 'Supplier delivery note DO-2026-0719',
    },
    stockReceipt: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      medicationId,
      medicationCode: medication.code,
      medicationName: medication.name,
      batchNumber: 'LOT-PARA-2026-07',
      expiryDate: '2028-07-31',
      quantity: 250,
      allocatedQty: 0,
      remainingQty: 250,
      receivedAt: timestamp,
      receivedById: userId,
      notes: 'Supplier delivery note DO-2026-0719',
      createdAt: timestamp,
    },
    inventorySummary: {
      asOfDate: '2026-07-20',
      medicationCount: 1,
      totalStockQty: 250,
      reorderCount: 0,
      items: [{
        medicationId,
        medicationCode: medication.code,
        medicationName: medication.name,
        stockQty: 250,
        reorderLevel: 50,
        needsReorder: false,
        nearestExpiryDate: '2028-07-31',
        unknownExpiryQty: 0,
      }],
    },
    expiryReport: {
      asOfDate: '2026-07-20',
      throughDate: '2026-10-18',
      items: [{
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        medicationId,
        medicationCode: medication.code,
        medicationName: medication.name,
        batchNumber: 'LOT-PARA-2026-07',
        expiryDate: '2026-08-15',
        quantity: 250,
        allocatedQty: 25,
        remainingQty: 225,
        receivedAt: timestamp,
        receivedById: userId,
        notes: 'Supplier delivery note DO-2026-0719',
        createdAt: timestamp,
        expiryStatus: 'EXPIRING',
        daysUntilExpiry: 26,
      }],
    },
    prescriptionRequest: {
      patientId,
      doctorId,
      notes: 'Take after meals',
      items: [
        {
          medicationId,
          dosage: '500 mg',
          frequency: 'Three times daily',
          durationDays: 3,
          quantity: 9,
          allocations: [{
            stockReceiptId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            batchNumber: 'LOT-PARA-2026-07',
            expiryDate: '2028-07-31',
            quantity: 9,
          }],
          instructions: 'Take after meals',
        },
      ],
    },
    prescription: {
      id: prescriptionId,
      patientId,
      doctorId,
      status: 'ISSUED',
      issuedAt: timestamp,
      notes: 'Take after meals',
      createdAt: timestamp,
      updatedAt: timestamp,
      patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
      doctor: {
        id: doctorId,
        licenseNumber: doctor.licenseNumber,
        fullName: doctor.fullName,
      },
      items: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          medicationId,
          medicationCode: medication.code,
          medicationName: medication.name,
          dosage: '500 mg',
          frequency: 'Three times daily',
          durationDays: 3,
          quantity: 9,
          instructions: 'Take after meals',
        },
      ],
    },
    dispenseRequest: {
      prescriptionId,
      notes: 'Dispensed in full',
      items: [{ medicationId, quantity: 9 }],
    },
    dispense: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      prescriptionId,
      prescriptionStatus: 'DISPENSED',
      pharmacistId: userId,
      status: 'COMPLETED',
      dispensedAt: timestamp,
      notes: 'Dispensed in full',
      createdAt: timestamp,
      updatedAt: timestamp,
      items: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          medicationId,
          medicationCode: medication.code,
          medicationName: medication.name,
          quantity: 9,
        },
      ],
    },
  },
  // SJ-4. The example is a read, because a read is the case people forget an
  // audit log records at all.
  audit: {
    event: {
      id: '99999999-9999-4999-8999-999999999999',
      actorUserId: userId,
      actorRole: 'DOCTOR',
      action: 'READ',
      resource: 'patient',
      resourceId: patientId,
      patientId,
      ipAddress: '203.0.113.24',
      requestId: 'f1e2d3c4-b5a6-4978-8899-aabbccddeeff',
      metadata: { method: 'GET', route: '/api/v1/patients/:id' },
      occurredAt: timestamp,
    },
  },
  paginationMeta,
} as const;
