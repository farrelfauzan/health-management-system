'use client';

import { Icon, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { CodeSearchOption } from '#lib/encounters/code-search-option';
import { MIN_CODE_SEARCH_LENGTH } from '#lib/encounters/code-search-config';

type CodeSearchPickerProps = {
  id: string;
  label: string;
  placeholder: string;
  search: string;
  codes: CodeSearchOption[];
  isPending: boolean;
  isEnabled: boolean;
  selected: CodeSearchOption | null;
  onSearchChange: (value: string) => void;
  onSelect: (option: CodeSearchOption | null) => void;
};

export function CodeSearchPicker({
  id,
  label,
  placeholder,
  search,
  codes,
  isPending,
  isEnabled,
  selected,
  onSearchChange,
  onSelect,
}: CodeSearchPickerProps) {
  const t = useTranslations('clinical');
  if (selected) {
    return (
      <div>
        <span className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
          {label}
        </span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-sm text-slate-800">
            <span className="font-mono font-medium">{selected.code}</span> — {selected.display}
          </p>
          <button
            type="button"
            aria-label={t('encounters.codeSearch.clear', { label })}
            className="text-slate-400 hover:text-slate-700"
            onClick={() => onSelect(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
        {label}
      </label>
      <Input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      {isEnabled ? (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
          {isPending ? (
            <p className="px-3 py-2 text-sm text-slate-500">
              {t('encounters.codeSearch.searching')}
            </p>
          ) : codes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">{t('encounters.codeSearch.empty')}</p>
          ) : (
            <ul>
              {codes.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => onSelect(option)}
                  >
                    <span className="font-mono text-xs font-medium text-primary">
                      {option.code}
                    </span>
                    <span className="text-sm text-slate-700">{option.display}</span>
                    {option.displayIndonesian ? (
                      <span className="text-xs text-slate-400">{option.displayIndonesian}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">
          Type at least {MIN_CODE_SEARCH_LENGTH} characters to search the catalog.
        </p>
      )}
    </div>
  );
}
