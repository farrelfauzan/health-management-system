import { describe, expect, it } from 'vitest';

import { validatePatientAddress } from './validate-patient-address';
import type { PatientAddressFormValues } from './patient-address-form-values.types';

const MESSAGES = {
  provinceRequired: 'province-required',
  regencyRequired: 'regency-required',
  districtRequired: 'district-required',
  villageRequired: 'village-required',
  chainIncomplete: 'chain-incomplete',
  rtRwInvalid: 'rt-rw-invalid',
  postalCodeInvalid: 'postal-code-invalid',
};

const EMPTY: PatientAddressFormValues = {
  provinceCode: '',
  provinceName: '',
  regencyCode: '',
  regencyName: '',
  districtCode: '',
  districtName: '',
  villageCode: '',
  villageName: '',
  rtRw: '',
  postalCode: '',
};

const FULL_CHAIN: PatientAddressFormValues = {
  provinceCode: '31',
  provinceName: 'Daerah Khusus Ibukota Jakarta',
  regencyCode: '31.71',
  regencyName: 'Kota Administrasi Jakarta Pusat',
  districtCode: '31.71.01',
  districtName: 'Gambir',
  villageCode: '31.71.01.1001',
  villageName: 'Gambir',
  rtRw: '',
  postalCode: '',
};

describe('validatePatientAddress', () => {
  it('names every missing level on a create', () => {
    const actual = validatePatientAddress({
      values: EMPTY,
      isChainRequired: true,
      messages: MESSAGES,
    });

    expect(actual).toEqual({
      provinceCode: 'province-required',
      regencyCode: 'regency-required',
      districtCode: 'district-required',
      villageCode: 'village-required',
    });
  });

  it('accepts a whole chain', () => {
    expect(
      validatePatientAddress({ values: FULL_CHAIN, isChainRequired: true, messages: MESSAGES }),
    ).toEqual({});
  });

  it('accepts no chain at all on an edit, so an untouched legacy record still saves', () => {
    expect(
      validatePatientAddress({ values: EMPTY, isChainRequired: false, messages: MESSAGES }),
    ).toEqual({});
  });

  it('refuses a half-filled chain on an edit, because the API replaces it whole', () => {
    const actual = validatePatientAddress({
      values: { ...FULL_CHAIN, districtCode: '', districtName: '', villageCode: '', villageName: '' },
      isChainRequired: false,
      messages: MESSAGES,
    });

    expect(actual).toEqual({
      districtCode: 'chain-incomplete',
      villageCode: 'chain-incomplete',
    });
  });

  it('checks RT/RW against the pattern the API uses', () => {
    expect(
      validatePatientAddress({
        values: { ...FULL_CHAIN, rtRw: '003/007' },
        isChainRequired: true,
        messages: MESSAGES,
      }),
    ).toEqual({});
    expect(
      validatePatientAddress({
        values: { ...FULL_CHAIN, rtRw: '003-007' },
        isChainRequired: true,
        messages: MESSAGES,
      }),
    ).toEqual({ rtRw: 'rt-rw-invalid' });
  });

  it('checks the postal code against the pattern the API uses', () => {
    expect(
      validatePatientAddress({
        values: { ...FULL_CHAIN, postalCode: '10110' },
        isChainRequired: true,
        messages: MESSAGES,
      }),
    ).toEqual({});
    expect(
      validatePatientAddress({
        values: { ...FULL_CHAIN, postalCode: '101' },
        isChainRequired: true,
        messages: MESSAGES,
      }),
    ).toEqual({ postalCode: 'postal-code-invalid' });
  });
});
