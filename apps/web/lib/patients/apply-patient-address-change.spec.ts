import { describe, expect, it } from 'vitest';

import { applyPatientAddressChange } from './apply-patient-address-change';
import type { PatientAddressFormValues } from './patient-address-form-values.types';

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

describe('applyPatientAddressChange', () => {
  it('clears every level below the one that changed', () => {
    const actual = applyPatientAddressChange({
      values: FULL_CHAIN,
      field: 'provinceCode',
      code: '11',
      name: 'Aceh',
    });

    expect(actual.provinceCode).toBe('11');
    expect(actual.provinceName).toBe('Aceh');
    expect(actual.regencyCode).toBe('');
    expect(actual.regencyName).toBe('');
    expect(actual.districtCode).toBe('');
    expect(actual.districtName).toBe('');
    expect(actual.villageCode).toBe('');
    expect(actual.villageName).toBe('');
  });

  it('leaves the levels above the one that changed alone', () => {
    const actual = applyPatientAddressChange({
      values: FULL_CHAIN,
      field: 'districtCode',
      code: '31.71.02',
      name: 'Sawah Besar',
    });

    expect(actual.provinceCode).toBe('31');
    expect(actual.regencyCode).toBe('31.71');
    expect(actual.districtCode).toBe('31.71.02');
    expect(actual.villageCode).toBe('');
  });

  it('keeps RT/RW and the postal code, which belong to no level', () => {
    const actual = applyPatientAddressChange({
      values: FULL_CHAIN,
      field: 'regencyCode',
      code: '31.72',
      name: 'Kota Administrasi Jakarta Utara',
    });

    expect(actual.rtRw).toBe('003/007');
    expect(actual.postalCode).toBe('10110');
  });

  it('changes nothing but the village when the bottom level moves', () => {
    const actual = applyPatientAddressChange({
      values: FULL_CHAIN,
      field: 'villageCode',
      code: '31.71.01.1002',
      name: 'Kebon Kelapa',
    });

    expect(actual).toEqual({
      ...FULL_CHAIN,
      villageCode: '31.71.01.1002',
      villageName: 'Kebon Kelapa',
    });
  });

  it('does not mutate the values it was given', () => {
    applyPatientAddressChange({
      values: FULL_CHAIN,
      field: 'provinceCode',
      code: '11',
      name: 'Aceh',
    });

    expect(FULL_CHAIN.regencyCode).toBe('31.71');
  });
});
