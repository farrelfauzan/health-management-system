'use client';

import {
  CORETAX_KODE_08_ADDITIONAL_INFO_OPTIONS,
  CORETAX_KODE_08_FACILITY_STAMP_OPTIONS,
  CORETAX_UNIT_OPTIONS,
} from '@hms/shared-types';
import { Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { TaxCoretaxReferenceSelect } from '#components/client/taxes/tax-coretax-reference-select';
import type { TaxCoretaxFormValues } from '#lib/taxes/tax-coretax-form-values';

type TaxCoretaxFieldsProps = {
  idPrefix: string;
  values: TaxCoretaxFormValues;
  /** A kode-08 code also names its exemption facility. */
  isExempt: boolean;
  disabled?: boolean;
  onChange: (change: Partial<TaxCoretaxFormValues>) => void;
};

/**
 * The Coretax faktur fields of a tax code (P27-T09): the six-digit item code
 * and the unit from DJP's list, and for kode 08 the keterangan tambahan and
 * cap fasilitas from DJP's Faktur Keluaran template.
 */
export function TaxCoretaxFields({
  idPrefix,
  values,
  isExempt,
  disabled = false,
  onChange,
}: TaxCoretaxFieldsProps) {
  const t = useTranslations('operations.taxes.codes.form');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <FormLabel htmlFor={`${idPrefix}-item-code`}>{t('coretaxItemCode')}</FormLabel>
          <Input
            id={`${idPrefix}-item-code`}
            className="font-mono"
            inputMode="numeric"
            maxLength={6}
            value={values.coretaxItemCode}
            disabled={disabled}
            placeholder="000000"
            onChange={(event) => onChange({ coretaxItemCode: event.target.value.trim() })}
          />
          <p className="text-xs text-slate-500">{t('coretaxItemCodeHelp')}</p>
        </div>
        <div className="space-y-1">
          <FormLabel htmlFor={`${idPrefix}-unit`}>{t('coretaxUnitCode')}</FormLabel>
          <TaxCoretaxReferenceSelect
            id={`${idPrefix}-unit`}
            value={values.coretaxUnitCode}
            options={CORETAX_UNIT_OPTIONS}
            noneLabel={t('coretaxNone')}
            disabled={disabled}
            onChange={(code) => onChange({ coretaxUnitCode: code })}
          />
        </div>
      </div>
      {isExempt ? (
        <div className="grid gap-3">
          <div className="space-y-1">
            <FormLabel htmlFor={`${idPrefix}-additional-info`}>
              {t('coretaxAdditionalInfo')}
            </FormLabel>
            <TaxCoretaxReferenceSelect
              id={`${idPrefix}-additional-info`}
              value={values.coretaxAdditionalInfo}
              options={CORETAX_KODE_08_ADDITIONAL_INFO_OPTIONS}
              noneLabel={t('coretaxNone')}
              disabled={disabled}
              onChange={(code) => onChange({ coretaxAdditionalInfo: code })}
            />
          </div>
          <div className="space-y-1">
            <FormLabel htmlFor={`${idPrefix}-facility`}>{t('coretaxFacilityStamp')}</FormLabel>
            <TaxCoretaxReferenceSelect
              id={`${idPrefix}-facility`}
              value={values.coretaxFacilityStamp}
              options={CORETAX_KODE_08_FACILITY_STAMP_OPTIONS}
              noneLabel={t('coretaxNone')}
              disabled={disabled}
              onChange={(code) => onChange({ coretaxFacilityStamp: code })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
