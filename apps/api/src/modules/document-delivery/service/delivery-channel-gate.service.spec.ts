import { DeliveryGateChannelLinkRecord, DeliveryGatePatientRecord } from '@hms/shared-types';

import { DeliveryGateRepository } from '../repository/delivery-gate.repository';
import { DeliveryChannelGateService } from './delivery-channel-gate.service';

const PATIENT_ID = '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c';
const OTHER_PATIENT_ID = '1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';

function buildPatient(
  overrides: Partial<DeliveryGatePatientRecord> = {},
): DeliveryGatePatientRecord {
  return {
    id: PATIENT_ID,
    phoneNumber: '0812-1000-0001',
    email: 'rina@example.test',
    ...overrides,
  };
}

function buildLink(
  overrides: Partial<DeliveryGateChannelLinkRecord> = {},
): DeliveryGateChannelLinkRecord {
  return {
    id: 'link-1',
    externalChatId: '6281210000001@s.whatsapp.net',
    phoneNumber: '6281210000001',
    patientId: PATIENT_ID,
    isVerified: true,
    ...overrides,
  };
}

describe('DeliveryChannelGateService', () => {
  let mockRepository: jest.Mocked<Pick<DeliveryGateRepository, 'findWhatsappLinksForPatient'>>;
  let service: DeliveryChannelGateService;

  beforeEach(() => {
    mockRepository = { findWhatsappLinksForPatient: jest.fn().mockResolvedValue([]) };
    service = new DeliveryChannelGateService(mockRepository as unknown as DeliveryGateRepository);
  });

  it('asks for links by the patient id and the normalised number', async () => {
    await service.resolveWhatsappGate(buildPatient({ phoneNumber: '+62 812-1000-0001' }));

    // The counter typed the number with punctuation; the link table holds
    // digits. Comparing the typed form would miss every real match.
    expect(mockRepository.findWhatsappLinksForPatient).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      normalizedPhoneNumber: '6281210000001',
    });
  });

  it('opens the channel on a link verified for this patient and returns that link', async () => {
    const ownLink = buildLink();
    mockRepository.findWhatsappLinksForPatient.mockResolvedValue([ownLink]);

    const actual = await service.resolveWhatsappGate(buildPatient());

    expect(actual).toEqual({ isAllowed: true, refusalReason: null, link: ownLink });
  });

  it('refuses with NUMBER_NOT_LINKED when no chat has claimed the number', async () => {
    const actual = await service.resolveWhatsappGate(buildPatient());

    expect(actual).toEqual({ isAllowed: false, refusalReason: 'NUMBER_NOT_LINKED', link: null });
  });

  it('refuses with NUMBER_UNVERIFIED when the only claim is unproven', async () => {
    mockRepository.findWhatsappLinksForPatient.mockResolvedValue([
      buildLink({ patientId: null, isVerified: false }),
    ]);

    const actual = await service.resolveWhatsappGate(buildPatient());

    // The presence of a number is not the gate; the proof is.
    expect(actual.refusalReason).toBe('NUMBER_UNVERIFIED');
    expect(actual.link).toBeNull();
  });

  it('refuses with NUMBER_VERIFIED_FOR_ANOTHER_PATIENT when the proof names someone else', async () => {
    mockRepository.findWhatsappLinksForPatient.mockResolvedValue([
      buildLink({ patientId: OTHER_PATIENT_ID, isVerified: true }),
    ]);

    const actual = await service.resolveWhatsappGate(buildPatient());

    expect(actual.refusalReason).toBe('NUMBER_VERIFIED_FOR_ANOTHER_PATIENT');
    expect(actual.link).toBeNull();
  });

  it('ranks a proof for someone else above an unproven claim for this patient', async () => {
    mockRepository.findWhatsappLinksForPatient.mockResolvedValue([
      buildLink({ id: 'unverified-own', isVerified: false }),
      buildLink({ id: 'verified-other', patientId: OTHER_PATIENT_ID, isVerified: true }),
    ]);

    const actual = await service.resolveWhatsappGate(buildPatient());

    // A shared family phone: the number is proven to be the sister's. That
    // fact outranks the unfinished OTP flow for this patient.
    expect(actual.refusalReason).toBe('NUMBER_VERIFIED_FOR_ANOTHER_PATIENT');
  });

  it('opens the channel for this patient even when the same number is also proven for a relative', async () => {
    const ownLink = buildLink({ id: 'own' });
    mockRepository.findWhatsappLinksForPatient.mockResolvedValue([
      buildLink({ id: 'relative', patientId: OTHER_PATIENT_ID }),
      ownLink,
    ]);

    const actual = await service.resolveWhatsappGate(buildPatient());

    // The link is per (channel, chat, phone) and carries a patient id, so
    // delivery targets the row proven for *this* patient.
    expect(actual).toEqual({ isAllowed: true, refusalReason: null, link: ownLink });
  });

  it('refuses email when the record holds no address', () => {
    expect(service.resolveEmailGate(buildPatient({ email: null }))).toBe('EMAIL_MISSING');
    expect(service.resolveEmailGate(buildPatient({ email: '   ' }))).toBe('EMAIL_MISSING');
    expect(service.resolveEmailGate(buildPatient())).toBeNull();
  });
});
