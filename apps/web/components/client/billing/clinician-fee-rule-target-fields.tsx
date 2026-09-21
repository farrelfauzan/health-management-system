'use client';

import { SERVICE_TARIFF_CATEGORIES, type ServiceTariffCategoryValue } from '@hms/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { useBillableTariffs } from '#lib/billing/use-billable-tariffs';
import type {
  ClinicianFeeRuleFormValues,
  ClinicianFeeRuleTargetKind,
} from '#lib/clinician-fees/clinician-fee-rule-form-values';
import { useActiveDoctors } from '#lib/patients/use-active-doctors';

/** Radix Select cannot hold an empty value, so "every clinician" gets a sentinel. */
const ALL_CLINICIANS = 'ALL';

const TARGET_KINDS: readonly ClinicianFeeRuleTargetKind[] = ['CATEGORY', 'TARIFF'];

type ClinicianFeeRuleTargetFieldsProps = {
  values: ClinicianFeeRuleFormValues;
  disabled: boolean;
  onChange: (change: Partial<ClinicianFeeRuleFormValues>) => void;
};

/**
 * What a new rule prices (P27-T06): one tariff or a whole category, for one
 * clinician or all of them. Fixed once the rule exists.
 */
export function ClinicianFeeRuleTargetFields({
  values,
  disabled,
  onChange,
}: ClinicianFeeRuleTargetFieldsProps) {
  const t = useTranslations('operations.billing.fees');
  const tItemTypes = useTranslations('operations.billing.itemTypes');
  const { tariffs } = useBillableTariffs(true);
  const { doctors } = useActiveDoctors(true);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <FormLabel htmlFor="clinician-fee-target-kind" required>
          {t('form.targetKind')}
        </FormLabel>
        <Select
          value={values.targetKind}
          disabled={disabled}
          onValueChange={(value) => onChange({ targetKind: value as ClinicianFeeRuleTargetKind })}
        >
          <SelectTrigger id="clinician-fee-target-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`form.targetKinds.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {values.targetKind === 'TARIFF' ? (
        <div className="space-y-1">
          <FormLabel htmlFor="clinician-fee-tariff" required>
            {t('form.tariff')}
          </FormLabel>
          <Select
            value={values.serviceTariffId || undefined}
            disabled={disabled}
            onValueChange={(value) => onChange({ serviceTariffId: value })}
          >
            <SelectTrigger id="clinician-fee-tariff" className="w-full">
              <SelectValue placeholder={t('form.pickTariff')} />
            </SelectTrigger>
            <SelectContent>
              {tariffs.map((tariff) => (
                <SelectItem key={tariff.id} value={tariff.id}>
                  {tariff.code} · {tariff.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1">
          <FormLabel htmlFor="clinician-fee-category" required>
            {t('form.category')}
          </FormLabel>
          <Select
            value={values.category || undefined}
            disabled={disabled}
            onValueChange={(value) => onChange({ category: value as ServiceTariffCategoryValue })}
          >
            <SelectTrigger id="clinician-fee-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TARIFF_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {tItemTypes(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1 sm:col-span-2">
        <FormLabel htmlFor="clinician-fee-clinician">{t('form.clinician')}</FormLabel>
        <Select
          value={values.doctorId || ALL_CLINICIANS}
          disabled={disabled}
          onValueChange={(value) => onChange({ doctorId: value === ALL_CLINICIANS ? '' : value })}
        >
          <SelectTrigger id="clinician-fee-clinician" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLINICIANS}>{t('rules.allClinicians')}</SelectItem>
            {doctors.map((doctor) => (
              <SelectItem key={doctor.id} value={doctor.id}>
                {doctor.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
