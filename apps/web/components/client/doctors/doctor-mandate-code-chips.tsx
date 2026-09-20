'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { CodeSearchOption } from '#lib/encounters/code-search-option';

type DoctorMandateCodeChipsProps = {
  codes: CodeSearchOption[];
  onRemove: (code: string) => void;
};

/** The procedures a pelimpahan covers, each removable until it is saved. */
export function DoctorMandateCodeChips({ codes, onRemove }: DoctorMandateCodeChipsProps) {
  const t = useTranslations('clinical');
  if (codes.length === 0) {
    return (
      <p className="text-xs text-slate-500">{t('doctors.mandates.form.noProceduresYet')}</p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <li
          key={code.code}
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-slate-800"
        >
          <span className="font-mono font-medium">{code.code}</span>
          <span className="max-w-[16rem] truncate">{code.display}</span>
          <button
            type="button"
            aria-label={t('doctors.mandates.form.removeProcedure', { code: code.code })}
            className="text-slate-400 hover:text-slate-700"
            onClick={() => onRemove(code.code)}
          >
            <Icon name="close" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
