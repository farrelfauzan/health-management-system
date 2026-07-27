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
  mrn: 'MRN-2026-0001',
  fullName: 'Aisha Rahman',
  dateOfBirth: '1990-05-12',
  placeOfBirth: 'Bandung',
  sex: 'FEMALE',
  status: 'OUT_PATIENT',
  phoneNumber: '+628123456789',
  address: 'Jakarta',
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
  patientId,
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
};
const registration = {
  id: registrationId,
  patientId,
  appointmentId,
  status: 'REGISTERED',
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
  stockQty: 250,
};

const medicationUpdateRequest = {
  name: 'Paracetamol 500 mg',
  category: 'OBAT_BEBAS',
  stockQty: 300,
};

export const PHASE_THREE_EXAMPLES = {
  auth: {
    loginRequest: {
      email: 'admin@example.com',
      password: 'SecurePassword123!',
    },
    refreshRequest: {
      refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh.example',
    },
    logoutRequest: {
      refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh.example',
    },
    tokens: {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.access.example',
      refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh.example',
      tokenType: 'Bearer',
      expiresIn: '15m',
    },
    logoutResult: {
      success: true,
      message: 'Logged out',
    },
  },
  rbac: {
    roleItem: {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      code: 'ADMIN',
      name: 'Administrator',
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
      email: 'admin@example.com',
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      roles: [{ code: 'ADMIN', name: 'Administrator' }],
    },
  },
  patient: {
    createRequest: {
      mrn: 'MRN-2026-0001',
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
    updateRequest: {
      phoneNumber: '+628123456780',
      address: 'Bandung',
      status: 'IN_PATIENT',
      allergies: [{ substance: 'Penicillin', severity: 'MODERATE' }],
    },
    mutationMeta: { identifierWarnings: [] },
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
      patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
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
          patient: { id: patientId, mrn: patient.mrn, fullName: patient.fullName },
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
  },
  pharmacy: {
    medication,
    medicationCreateRequest,
    medicationUpdateRequest,
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
  paginationMeta,
} as const;
