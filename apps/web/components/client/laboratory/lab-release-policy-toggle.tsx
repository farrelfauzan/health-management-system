'use client';

import { Checkbox } from '@hms/ui';

type LabReleasePolicyToggleProps = {
  label: string;
  /** What this setting means in its current position, in plain words. */
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Shown only when the choice loosens a safety rule. */
  warning?: string;
};

/**
 * One release-policy switch and what it currently means (P18-T04).
 *
 * The description changes with the position rather than describing the switch
 * in the abstract: somebody deciding whether to turn this on needs to read
 * what the clinic will do afterwards, not what the toggle is called.
 */
export function LabReleasePolicyToggle({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  warning,
}: LabReleasePolicyToggleProps) {
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-0.5"
        />
        <span className="text-sm font-medium text-slate-900">{label}</span>
      </label>
      <p className="pl-7 text-xs text-slate-500">{description}</p>
      {warning ? <p className="pl-7 text-xs text-amber-700">{warning}</p> : null}
    </div>
  );
}
