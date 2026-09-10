'use client';

import { Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type LabIntakeSource = 'WALK_IN' | 'EXTERNAL_REFERRAL';

type LabIntakeSourceChoiceProps = {
  value: LabIntakeSource;
  onChange: (value: LabIntakeSource) => void;
  disabled?: boolean;
};

const SOURCES: readonly LabIntakeSource[] = ['WALK_IN', 'EXTERNAL_REFERRAL'];

/**
 * Which of the two kinds of request this is (P18-T10). Radio buttons rather
 * than a select: there are two, and the difference decides whether a doctor
 * has to be named — worth showing both answers at once rather than hiding one.
 */
export function LabIntakeSourceChoice({ value, onChange, disabled }: LabIntakeSourceChoiceProps) {
  const t = useTranslations('operations.laboratory.intake.source');
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SOURCES.map((source) => (
        <Label
          key={source}
          className={`block cursor-pointer rounded-lg border p-3 font-normal leading-normal ${
            value === source ? 'border-primary bg-primary-container/20' : 'border-slate-200'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="radio"
              name="lab-intake-source"
              value={source}
              checked={value === source}
              disabled={disabled}
              onChange={() => onChange(source)}
            />
            {t(source)}
          </span>
          <span className="mt-1 block text-xs text-slate-500">{t(`${source}_HINT`)}</span>
        </Label>
      ))}
    </div>
  );
}
