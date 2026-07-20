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
const patient = {
  id: patientId,
  mrn: 'MRN-2026-0001',
  fullName: 'Aisha Rahman',
  dateOfBirth: '1990-05-12',
  phoneNumber: '+628123456789',
  address: 'Jakarta',
  ownerUserId: userId,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const doctor = {
  id: doctorId,
  licenseNumber: 'SIP-2026-0001',
  fullName: 'Dr. Budi Santoso',
  specialty: 'Internal Medicine',
  phoneNumber: '+628129876543',
  ownerUserId: userId,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const appointment = {
  id: appointmentId,
  patientId,
  doctorId,
  scheduledAt: '2026-07-21T09:00:00.000Z',
  status: 'SCHEDULED',
  reason: 'Routine consultation',
  notes: 'First visit',
  createdById: userId,
  createdAt: timestamp,
  updatedAt: timestamp,
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
const medication = {
  id: medicationId,
  code: 'MED-PARA-500',
  name: 'Paracetamol',
  form: 'Tablet',
  strength: '500 mg',
  unit: 'tablet',
  stockQty: 250,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const PHASE_THREE_EXAMPLES = {
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
      phoneNumber: '+628123456789',
      address: 'Jakarta',
      ownerUserId: userId,
      doctorIds: [doctorId],
    },
    updateRequest: {
      phoneNumber: '+628123456780',
      address: 'Bandung',
    },
    item: patient,
    listItem: { ...patient, doctorCount: 1 },
    detail: {
      ...patient,
      doctors: [
        {
          id: doctorId,
          fullName: doctor.fullName,
          specialty: doctor.specialty,
        },
      ],
    },
  },
  doctor: {
    createRequest: {
      licenseNumber: 'SIP-2026-0001',
      fullName: 'Dr. Budi Santoso',
      specialty: 'Internal Medicine',
      phoneNumber: '+628129876543',
      ownerUserId: userId,
      patientIds: [patientId],
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
    listItem: { ...doctor, patientCount: 1 },
    detail: {
      ...doctor,
      patientCount: 1,
      schedules: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '16:00',
          isAvailable: true,
        },
      ],
      patients: [{ id: patientId, mrn: patient.mrn, fullName: patient.fullName }],
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
      patientId,
      doctorId,
      scheduledAt: '2026-07-21T09:00:00+07:00',
      reason: 'Routine consultation',
      notes: 'First visit',
    },
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
      },
    },
  },
  pharmacy: {
    medication,
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
