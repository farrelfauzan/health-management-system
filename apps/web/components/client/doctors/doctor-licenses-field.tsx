'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorLicenseRowFields } from '#components/client/doctors/doctor-license-row-fields';
import type { LicenseRow } from '#lib/doctors/doctor-credential-rows';

type DoctorLicensesFieldProps = {
  rows: LicenseRow[];
  onAdd: () => void;
  onChange: (key: string, changes: Partial<LicenseRow>) => void;
  onRemove: (key: string) => void;
};

export function DoctorLicensesField({ rows, onAdd, onChange, onRemove }: DoctorLicensesFieldProps) {
  const t = useTranslations('clinical');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('doctors.licensesTitle')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Icon name="add" size={16} />
          {t('doctors.addLicense')}
        </Button>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <DoctorLicenseRowFields
              key={row.key}
              row={row}
              index={index}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
          {t('doctors.licensesEmpty')}
        </p>
      )}
    </div>
  );
}
