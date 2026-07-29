'use client';

import { Button, Icon } from '@hms/ui';

import { DoctorLicenseRowFields } from '#components/client/doctors/doctor-license-row-fields';
import type { LicenseRow } from '#lib/doctors/doctor-credential-rows';

type DoctorLicensesFieldProps = {
  rows: LicenseRow[];
  onAdd: () => void;
  onChange: (key: string, changes: Partial<LicenseRow>) => void;
  onRemove: (key: string) => void;
};

export function DoctorLicensesField({
  rows,
  onAdd,
  onChange,
  onRemove,
}: DoctorLicensesFieldProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-semibold uppercase tracking-wide text-slate-500">
          Licences
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Icon name="add" size={16} />
          Add Licence
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
          No licence recorded. Saving replaces the whole list, so removing every row clears them.
        </p>
      )}
    </div>
  );
}
