import { redactChatContext } from './redact-chat-context';

describe('redactChatContext', () => {
  it.each([
    'nik',
    'patientNik',
    'bpjsNumber',
    'bpjs_number',
    'mrn',
    'medicalRecordNumber',
    'notes',
    'soapNotes',
    'diagnosis',
    'allergies',
    'prescriptionId',
    'accessToken',
    'apiKey',
    'secretKey',
    'passwordHash',
    'apiKeyCiphertext',
    'patientId',
    'doctorId',
    'ownerUserId',
    'email',
    'phoneNumber',
    'address',
  ])('strips the forbidden key %s', (forbiddenKey) => {
    const actualRedacted = redactChatContext({ [forbiddenKey]: 'sensitive-value', keep: 'ok' });

    expect(actualRedacted).toEqual({ keep: 'ok' });
    expect(JSON.stringify(actualRedacted)).not.toContain('sensitive-value');
  });

  it('keeps the fields §5.3 allows', () => {
    const actualRedacted = redactChatContext({
      displayName: 'Budi Santoso',
      activeQueueNumber: 12,
      todayAppointmentCount: 8,
      assignedPatientCount: 42,
      nextAppointmentAt: '2026-08-13T02:00:00.000Z',
    });

    expect(actualRedacted).toEqual({
      displayName: 'Budi Santoso',
      activeQueueNumber: 12,
      todayAppointmentCount: 8,
      assignedPatientCount: 42,
      nextAppointmentAt: '2026-08-13T02:00:00.000Z',
    });
  });

  it('strips forbidden keys nested inside an allowed object', () => {
    const actualRedacted = redactChatContext({
      nextAppointment: {
        scheduledAt: '2026-08-13T02:00:00.000Z',
        doctorName: 'dr. Andi Prasetyo, Sp.PD',
        specialty: 'Internal Medicine',
        status: 'SCHEDULED',
        patientId: 'leaked-uuid',
        notes: 'leaked clinical note',
      },
    });

    expect(actualRedacted).toEqual({
      nextAppointment: {
        scheduledAt: '2026-08-13T02:00:00.000Z',
        doctorName: 'dr. Andi Prasetyo, Sp.PD',
        specialty: 'Internal Medicine',
        status: 'SCHEDULED',
      },
    });
  });

  it('drops arrays outright — a list is a bulk export, never context', () => {
    const actualRedacted = redactChatContext({
      patients: [{ fullName: 'Someone Else' }],
      displayName: 'Budi Santoso',
    });

    expect(actualRedacted).toEqual({ displayName: 'Budi Santoso' });
  });

  it('drops nullish values and objects that redact to nothing', () => {
    const actualRedacted = redactChatContext({
      displayName: undefined,
      title: null,
      nextAppointment: { patientId: 'only-forbidden-keys' },
    });

    expect(actualRedacted).toEqual({});
  });
});
