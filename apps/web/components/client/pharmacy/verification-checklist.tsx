'use client';

import { Checkbox } from '@hms/ui';

import type { VerificationStep } from '#lib/pharmacy/verification-steps';

type VerificationChecklistProps = {
  steps: readonly VerificationStep[];
  checkedStepIds: readonly string[];
  onToggleStep: (stepId: string) => void;
  isDisabled?: boolean;
};

export function VerificationChecklist({
  steps,
  checkedStepIds,
  onToggleStep,
  isDisabled = false,
}: VerificationChecklistProps) {
  return (
    <div className="space-y-2">
      <p className="font-heading text-xs font-semibold uppercase tracking-wider text-slate-500">
        Verification Steps
      </p>
      {steps.map((step) => (
        <label
          key={step.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Checkbox
            checked={checkedStepIds.includes(step.id)}
            disabled={isDisabled}
            onCheckedChange={() => onToggleStep(step.id)}
          />
          {step.label}
        </label>
      ))}
    </div>
  );
}
