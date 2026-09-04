import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PdfEncryptionService } from '../../../common/pdf/pdf-encryption.service';
import { DeliveryPasswordService } from './delivery-password.service';
import { ProtectDeliveryDocumentService } from './protect-delivery-document.service';

const PATIENT = {
  id: '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c',
  mrn: 'MRN-000123',
  dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
};
const PLAIN_PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
const LOCKED_PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe('ProtectDeliveryDocumentService', () => {
  let mockEncryption: jest.Mocked<Pick<PdfEncryptionService, 'encryptWithUserPassword'>>;

  function buildService(environment: Record<string, string> = {}): ProtectDeliveryDocumentService {
    return new ProtectDeliveryDocumentService(
      new DeliveryPasswordService(new ConfigService(environment)),
      mockEncryption as unknown as PdfEncryptionService,
    );
  }

  beforeEach(() => {
    mockEncryption = { encryptWithUserPassword: jest.fn().mockResolvedValue(LOCKED_PDF) };
  });

  it('locks the PDF with the resolved password and returns only the bytes and the scheme', async () => {
    const actual = await buildService().protectForPatient({ pdf: PLAIN_PDF, patient: PATIENT });

    expect(mockEncryption.encryptWithUserPassword).toHaveBeenCalledWith({
      pdf: PLAIN_PDF,
      userPassword: '07031988',
    });
    expect(actual).toEqual({ content: LOCKED_PDF, passwordSource: 'DOB_DDMMYYYY' });
    // The result is what the delivery row stores; it must not carry the value.
    expect(JSON.stringify({ ...actual, content: undefined })).not.toContain('07031988');
  });

  it('records the configured scheme when the clinic changes it', async () => {
    const actual = await buildService({ DELIVERY_PDF_PASSWORD_SOURCE: 'MRN' }).protectForPatient({
      pdf: PLAIN_PDF,
      patient: PATIENT,
    });

    expect(mockEncryption.encryptWithUserPassword).toHaveBeenCalledWith({
      pdf: PLAIN_PDF,
      userPassword: 'MRN-000123',
    });
    expect(actual.passwordSource).toBe('MRN');
  });

  it('refuses before encrypting when the patient has no date of birth', async () => {
    await expect(
      buildService().protectForPatient({
        pdf: PLAIN_PDF,
        patient: { ...PATIENT, dateOfBirth: null },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // Nothing is encrypted and nothing could have been dispatched.
    expect(mockEncryption.encryptWithUserPassword).not.toHaveBeenCalled();
  });

  it('describes the scheme without the value', () => {
    const actual = buildService().describeScheme();

    expect(actual).toContain('DDMMYYYY');
    expect(actual).not.toContain('07031988');
  });
});
