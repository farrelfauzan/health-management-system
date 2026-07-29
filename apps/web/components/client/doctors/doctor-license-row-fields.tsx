'use client';

import { DOCTOR_LICENSE_TYPES, type DoctorLicenseTypeValue } from '@hms/shared-types';
import {
  DatePicker,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import type { LicenseRow } from '#lib/doctors/doctor-credential-rows';

type DoctorLicenseRowFieldsProps = {
  row: LicenseRow;
  index: number;
  onChange: (key: string, changes: Partial<LicenseRow>) => void;
  onRemove: (key: string) => void;
};

export function DoctorLicenseRowFields({
  row,
  index,
  onChange,
  onRemove,
}: DoctorLicenseRowFieldsProps) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs font-medium text-slate-600">Licence {index + 1}</p>
        <button
          type="button"
          aria-label={`Remove licence ${index + 1}`}
          className="text-slate-400 hover:text-danger"
          onClick={() => onRemove(row.key)}
        >
          <Icon name="delete" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor={`license-type-${row.key}`}
            className="block font-heading text-xs font-medium text-slate-600"
          >
            Type
          </label>
          <Select
            value={row.type}
            onValueChange={(value) =>
              onChange(row.key, { type: value as DoctorLicenseTypeValue })
            }
          >
            <SelectTrigger id={`license-type-${row.key}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCTOR_LICENSE_TYPES.map((typeValue) => (
                <SelectItem key={typeValue} value={typeValue}>
                  {typeValue}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`license-number-${row.key}`}
            className="block font-heading text-xs font-medium text-slate-600"
          >
            Number
          </label>
          <Input
            id={`license-number-${row.key}`}
            value={row.licenseNumber}
            onChange={(event) => onChange(row.key, { licenseNumber: event.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <span className="block font-heading text-xs font-medium text-slate-600">Issued</span>
          <DatePicker
            aria-label={`Licence ${index + 1} issued date`}
            className="w-full"
            placeholder="Issued"
            value={row.issuedAt}
            onValueChange={(value) => onChange(row.key, { issuedAt: value })}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block font-heading text-xs font-medium text-slate-600">Expires</span>
          <DatePicker
            aria-label={`Licence ${index + 1} expiry date`}
            className="w-full"
            placeholder={row.type === 'STR' ? 'No expiry' : 'Expires'}
            value={row.expiresAt}
            minValue={row.issuedAt}
            onValueChange={(value) => onChange(row.key, { expiresAt: value })}
          />
        </div>
      </div>
      {row.type === 'STR' ? (
        <p className="text-xs text-slate-500">
          STR is lifetime under UU Kesehatan 17/2023 — leave the expiry blank unless the record
          predates it.
        </p>
      ) : null}
    </div>
  );
}
