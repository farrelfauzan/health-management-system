import { describe, expect, it } from 'vitest';

import { buildPatientUpdateAddressFields } from './build-patient-update-address-fields';
import { buildPatientCreateAddressFields } from './build-patient-create-address-fields';
import type { PatientAddressFormValues } from './patient-address-form-values.types';

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
  rtRw: '003/007',
  postalCode: '10110',
};

describe('buildPatientUpdateAddressFields', () => {
  it('sends nothing for a record whose address section was never touched', () => {
    expect(buildPatientUpdateAddressFields(EMPTY)).toEqual({});
  });

  it('sends the chain whole, never the resolved names', () => {
    expect(buildPatientUpdateAddressFields(FULL_CHAIN)).toEqual({
      provinceCode: '31',
      regencyCode: '31.71',
      districtCode: '31.71.01',
      villageCode: '31.71.01.1001',
      rtRw: '003/007',
      postalCode: '10110',
    });
  });

  it('holds back a half-filled chain, which the API would refuse', () => {
    const actual = buildPatientUpdateAddressFields({ ...FULL_CHAIN, villageCode: '' });

    expect(actual.provinceCode).toBeUndefined();
    expect(actual.regencyCode).toBeUndefined();
    expect(actual.rtRw).toBe('003/007');
  });

  it('drops a blank RT/RW rather than clearing the stored one', () => {
    const actual = buildPatientUpdateAddressFields({ ...FULL_CHAIN, rtRw: '   ' });

    expect('rtRw' in actual).toBe(false);
  });
});

describe('buildPatientCreateAddressFields', () => {
  it('always sends the four codes, which the create schema requires', () => {
    expect(buildPatientCreateAddressFields(FULL_CHAIN)).toEqual({
      provinceCode: '31',
      regencyCode: '31.71',
      districtCode: '31.71.01',
      villageCode: '31.71.01.1001',
      rtRw: '003/007',
      postalCode: '10110',
    });
  });

  it('omits a blank RT/RW and postal code, which stay optional', () => {
    const actual = buildPatientCreateAddressFields({ ...FULL_CHAIN, rtRw: '', postalCode: '' });

    expect(actual).toEqual({
      provinceCode: '31',
      regencyCode: '31.71',
      districtCode: '31.71.01',
      villageCode: '31.71.01.1001',
    });
  });
});
