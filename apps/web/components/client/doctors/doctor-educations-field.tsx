'use client';

import { Button, Icon } from '@hms/ui';

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
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
          Education
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Icon name="add" size={16} />
          Add Education
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
          No education recorded. SATUSEHAT builds Practitioner qualifications from these entries.
        </p>
      )}
    </div>
  );
}
