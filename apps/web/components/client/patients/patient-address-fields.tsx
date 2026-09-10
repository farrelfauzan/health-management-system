'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AddressChainField } from '@hms/shared-types';
import { Input } from '@hms/ui';

import { PatientAddressRegionField } from '#components/client/patients/patient-address-region-field';
import { FormLabel } from '#components/client/shared/form-label';
import { applyPatientAddressChange } from '#lib/patients/apply-patient-address-change';
import { formatRtRwInput } from '#lib/patients/format-rt-rw-input';
import type { PatientAddressFieldErrors } from '#lib/patients/patient-address-field-errors.types';
import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';
import { buildRegionOptions } from '#lib/regions/build-region-options';
import { useDistricts } from '#lib/regions/use-districts';
import { useProvinces } from '#lib/regions/use-provinces';
import { useRegencies } from '#lib/regions/use-regencies';
import { useVillages } from '#lib/regions/use-villages';

type PatientAddressFieldsProps = {
  value: PatientAddressFormValues;
  onChange: (value: PatientAddressFormValues) => void;
  errors: PatientAddressFieldErrors;
  /** True on a create, where the schema demands the whole chain. */
  isRequired: boolean;
  /** False while the dialog is closed, so four region lists are not fetched. */
  isEnabled: boolean;
};

/**
 * Province → regency or city → kecamatan → kelurahan or desa, then RT/RW and
 * the postal code (`P19-T11`).
 *
 * Each level is fetched from its parent and each level below a change is
 * cleared, so the four codes that reach the API are always a chain the master
 * data recognises. Villages are searched on the server rather than listed:
 * there are 83,762 of them nationally, and a district's few hundred are more
 * than a dropdown should hold.
 *
 * A level whose parent list came back empty — which is also what a code the
 * master data no longer has looks like, because the API answers an unknown
 * parent with an empty page rather than a 404 — renders as an empty combobox
 * saying so, never as an error. Nothing about a blank list tells the clerk
 * anything they can act on, and blocking the form over it would strand a
 * registration the desk has no other way to complete.
 */
export function PatientAddressFields({
  value,
  onChange,
  errors,
  isRequired,
  isEnabled,
}: PatientAddressFieldsProps) {
  const t = useTranslations('clinical');
  const [villageSearch, setVillageSearch] = useState<string>('');
  const provinces = useProvinces(isEnabled);
  const regencies = useRegencies({ provinceCode: value.provinceCode, enabled: isEnabled });
  const districts = useDistricts({ regencyCode: value.regencyCode, enabled: isEnabled });
  const villages = useVillages({
    districtCode: value.districtCode,
    search: villageSearch,
    enabled: isEnabled,
  });

  function handleLevelChange(
    field: AddressChainField,
    option: { code: string; name: string },
  ): void {
    if (field !== 'villageCode') {
      setVillageSearch('');
    }
    onChange(
      applyPatientAddressChange({ values: value, field, code: option.code, name: option.name }),
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <PatientAddressRegionField
          id="provinceCode"
          label={t('patients.form.province')}
          isRequired={isRequired}
          options={buildRegionOptions({
            regions: provinces.regions,
            selected: { code: value.provinceCode, name: value.provinceName },
          })}
          value={value.provinceCode}
          selectedLabel={value.provinceName}
          placeholder={t('patients.form.selectProvince')}
          searchPlaceholder={t('patients.form.searchRegion')}
          emptyMessage={t('patients.form.noRegions')}
          isLoading={provinces.isPending && isEnabled}
          isDisabled={false}
          error={errors.provinceCode}
          onChange={(option) => handleLevelChange('provinceCode', option)}
        />
        <PatientAddressRegionField
          id="regencyCode"
          label={t('patients.form.regency')}
          isRequired={isRequired}
          options={buildRegionOptions({
            regions: regencies.regions,
            selected: { code: value.regencyCode, name: value.regencyName },
          })}
          value={value.regencyCode}
          selectedLabel={value.regencyName}
          placeholder={
            value.provinceCode === ''
              ? t('patients.form.selectProvinceFirst')
              : t('patients.form.selectRegency')
          }
          searchPlaceholder={t('patients.form.searchRegion')}
          emptyMessage={t('patients.form.noRegions')}
          isLoading={regencies.isFetching}
          isDisabled={value.provinceCode === ''}
          error={errors.regencyCode}
          onChange={(option) => handleLevelChange('regencyCode', option)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PatientAddressRegionField
          id="districtCode"
          label={t('patients.form.district')}
          isRequired={isRequired}
          options={buildRegionOptions({
            regions: districts.regions,
            selected: { code: value.districtCode, name: value.districtName },
          })}
          value={value.districtCode}
          selectedLabel={value.districtName}
          placeholder={
            value.regencyCode === ''
              ? t('patients.form.selectRegencyFirst')
              : t('patients.form.selectDistrict')
          }
          searchPlaceholder={t('patients.form.searchRegion')}
          emptyMessage={t('patients.form.noRegions')}
          isLoading={districts.isFetching}
          isDisabled={value.regencyCode === ''}
          error={errors.districtCode}
          onChange={(option) => handleLevelChange('districtCode', option)}
        />
        <PatientAddressRegionField
          id="villageCode"
          label={t('patients.form.village')}
          isRequired={isRequired}
          options={buildRegionOptions({
            regions: villages.regions,
            selected: { code: value.villageCode, name: value.villageName },
          })}
          value={value.villageCode}
          selectedLabel={value.villageName}
          placeholder={
            value.districtCode === ''
              ? t('patients.form.selectDistrictFirst')
              : t('patients.form.selectVillage')
          }
          searchPlaceholder={t('patients.form.searchVillage')}
          emptyMessage={
            villages.isFetching ? t('patients.form.searchingRegions') : t('patients.form.noRegions')
          }
          isLoading={false}
          isDisabled={value.districtCode === ''}
          error={errors.villageCode}
          searchValue={villageSearch}
          onSearchValueChange={setVillageSearch}
          onChange={(option) => handleLevelChange('villageCode', option)}
        />
      </div>
      {villages.hasMore ? (
        <p className="text-xs text-slate-500">{t('patients.form.villageSearchHint')}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel htmlFor="rtRw" className="font-heading text-xs text-slate-600">
            {t('patients.form.rtRw')}
          </FormLabel>
          <Input
            id="rtRw"
            inputMode="numeric"
            value={value.rtRw}
            placeholder="003/007"
            aria-invalid={errors.rtRw !== undefined}
            onChange={(event) => onChange({ ...value, rtRw: formatRtRwInput(event.target.value) })}
          />
          {errors.rtRw ? <p className="text-xs text-rose-600">{errors.rtRw}</p> : null}
        </div>
        <div className="space-y-1.5">
          <FormLabel htmlFor="postalCode" className="font-heading text-xs text-slate-600">
            {t('patients.form.postalCode')}
          </FormLabel>
          <Input
            id="postalCode"
            inputMode="numeric"
            value={value.postalCode}
            placeholder="10110"
            aria-invalid={errors.postalCode !== undefined}
            onChange={(event) => onChange({ ...value, postalCode: event.target.value })}
          />
          {errors.postalCode ? <p className="text-xs text-rose-600">{errors.postalCode}</p> : null}
        </div>
      </div>
    </div>
  );
}
