'use client';

import { Icon, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { CredentialCatalogHint } from '#components/client/doctors/credential-catalog-hint';
import { FieldOfStudyCombobox } from '#components/client/doctors/field-of-study-combobox';
import { FormLabel } from '#components/client/shared/form-label';
import type { EducationRow } from '#lib/doctors/doctor-credential-rows';

type DoctorEducationRowFieldsProps = {
  row: EducationRow;
  index: number;
  onChange: (key: string, changes: Partial<EducationRow>) => void;
  onRemove: (key: string) => void;
};

export function DoctorEducationRowFields({
  row,
  index,
  onChange,
  onRemove,
}: DoctorEducationRowFieldsProps) {
  const t = useTranslations('clinical');
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-medium text-slate-600">
          {t('doctors.credentials.education', { index: index + 1 })}
        </p>
        <button
          type="button"
          aria-label={t('doctors.credentials.removeEducation', { index: index + 1 })}
          className="text-slate-400 hover:text-danger"
          onClick={() => onRemove(row.key)}
        >
          <Icon name="delete" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`education-institution-${row.key}`}
            className="font-heading text-xs text-slate-600"
            required
          >
            {t('doctors.credentials.institution')}
          </FormLabel>
          <Input
            id={`education-institution-${row.key}`}
            value={row.institution}
            placeholder="Universitas Indonesia"
            onChange={(event) => onChange(row.key, { institution: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`education-degree-${row.key}`}
            className="font-heading text-xs text-slate-600"
            required
          >
            {t('doctors.credentials.degree')}
          </FormLabel>
          <Input
            id={`education-degree-${row.key}`}
            value={row.degree}
            placeholder="dr."
            onChange={(event) => onChange(row.key, { degree: event.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`education-field-${row.key}`}
            className="font-heading text-xs text-slate-600"
          >
            {t('doctors.credentials.field')}
          </FormLabel>
          <FieldOfStudyCombobox
            id={`education-field-${row.key}`}
            value={row.fieldOfStudy}
            onChange={(code) => onChange(row.key, { fieldOfStudy: code })}
          />
          <CredentialCatalogHint legacyValue={row.legacyFieldOfStudy || undefined} />
        </div>
        <div className="space-y-1.5">
          <FormLabel
            htmlFor={`education-year-${row.key}`}
            className="font-heading text-xs text-slate-600"
          >
            {t('doctors.credentials.graduationYear')}
          </FormLabel>
          <Input
            id={`education-year-${row.key}`}
            inputMode="numeric"
            value={row.graduationYear}
            placeholder="2015"
            onChange={(event) => onChange(row.key, { graduationYear: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
