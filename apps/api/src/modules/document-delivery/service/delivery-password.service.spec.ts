import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeliveryPasswordPatientRecord } from '@hms/shared-types';

import { DeliveryPasswordService } from './delivery-password.service';

const PATIENT_ID = '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c';

function buildPatient(
  overrides: Partial<DeliveryPasswordPatientRecord> = {},
): DeliveryPasswordPatientRecord {
  return {
    id: PATIENT_ID,
    mrn: 'MRN-000123',
    dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
    ...overrides,
  };
}

function buildService(environment: Record<string, string> = {}): DeliveryPasswordService {
  return new DeliveryPasswordService(new ConfigService(environment));
}

describe('DeliveryPasswordService', () => {
  it('defaults to the date of birth as DDMMYYYY', () => {
    const service = buildService();

    expect(service.passwordSource).toBe('DOB_DDMMYYYY');
    expect(service.resolvePassword(buildPatient())).toBe('07031988');
  });

  it('switches derivation from configuration without a code change', () => {
    expect(
      buildService({ DELIVERY_PDF_PASSWORD_SOURCE: 'DOB_YYYYMMDD' }).resolvePassword(
        buildPatient(),
      ),
    ).toBe('19880307');
    expect(
      buildService({ DELIVERY_PDF_PASSWORD_SOURCE: 'MRN' }).resolvePassword(buildPatient()),
    ).toBe('MRN-000123');
  });

  it('refuses an unknown scheme at boot rather than at send time', () => {
    expect(() => buildService({ DELIVERY_PDF_PASSWORD_SOURCE: 'NIK' })).toThrow(
      /DELIVERY_PDF_PASSWORD_SOURCE must be one of/,
    );
  });

  it('refuses a patient with no date of birth, naming the field and where to complete it', () => {
    const service = buildService();

    let caught: unknown;
    try {
      service.resolvePassword(buildPatient({ dateOfBirth: null }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('DELIVERY_PASSWORD_SOURCE_MISSING');
    expect(body.errors).toEqual({
      missingField: 'dateOfBirth',
      recordPath: `/admin/patients/${PATIENT_ID}`,
    });
    expect(String(body.message)).toContain('date of birth');
  });

  it('does not need a date of birth when the clinic locks by MRN', () => {
    const service = buildService({ DELIVERY_PDF_PASSWORD_SOURCE: 'MRN' });

    expect(service.resolvePassword(buildPatient({ dateOfBirth: null }))).toBe('MRN-000123');
  });
});
