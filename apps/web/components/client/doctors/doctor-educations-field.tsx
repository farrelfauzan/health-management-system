'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorEducationRowFields } from '#components/client/doctors/doctor-education-row-fields';
import type { EducationRow } from '#lib/doctors/doctor-credential-rows';

type DoctorEducationsFieldProps = {
  rows: EducationRow[];
  onAdd: () => void;
  onChange: (key: string, changes: Partial<EducationRow>) => void;
  onRemove: (key: string) => void;
};

export function DoctorEducationsField({
  rows,
  onAdd,
  onChange,
  onRemove,
}: DoctorEducationsFieldProps) {
  const t = useTranslations('clinical');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('doctors.educationTitle')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Icon name="add" size={16} />
          {t('doctors.addEducation')}
        </Button>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <DoctorEducationRowFields
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
          {t('doctors.educationEmpty')}
        </p>
      )}
    </div>
  );
}
