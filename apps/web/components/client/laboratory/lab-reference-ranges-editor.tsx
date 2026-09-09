'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabReferenceRangeRow } from '#components/client/laboratory/lab-reference-range-row';
import {
  createEmptyLabReferenceRangeDraft,
  type LabReferenceRangeDraft,
} from '#lib/laboratory/lab-reference-range-draft';

type LabReferenceRangesEditorProps = {
  drafts: LabReferenceRangeDraft[];
  isNumeric: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (drafts: LabReferenceRangeDraft[]) => void;
};

/**
 * The bands that define "normal" for a test (`P18-T15`). Edited as a list and
 * saved whole, because that is what the API's PUT does: the set is what
 * defines normal, and replacing it one row at a time leaves windows where two
 * bands overlap or none applies. The overlap check runs in the dialog before
 * anything is sent; this shows its verdict beside the rows it names.
 */
export function LabReferenceRangesEditor({
  drafts,
  isNumeric,
  disabled,
  error,
  onChange,
}: LabReferenceRangesEditorProps) {
  const t = useTranslations('operations.laboratory.catalog.ranges');

  function handleAdd(): void {
    onChange([
      ...drafts,
      createEmptyLabReferenceRangeDraft(`draft-${Date.now()}-${drafts.length}`),
    ]);
  }

  function handleChange(index: number, draft: LabReferenceRangeDraft): void {
    onChange(drafts.map((existing, position) => (position === index ? draft : existing)));
  }

  function handleRemove(index: number): void {
    onChange(drafts.filter((_, position) => position !== index));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{t('title')}</p>
        <p className="text-xs text-slate-500">{t('description')}</p>
      </div>
      {drafts.length === 0 ? <p className="text-xs text-slate-400">{t('none')}</p> : null}
      {drafts.map((draft, index) => (
        <LabReferenceRangeRow
          key={draft.key}
          draft={draft}
          index={index}
          isNumeric={isNumeric}
          disabled={disabled}
          onChange={(next) => handleChange(index, next)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      {error ? (
        <p role="alert" className="text-xs text-rose-600" data-testid="lab-reference-ranges-error">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={handleAdd}>
        <Icon name="add" size={16} />
        {t('add')}
      </Button>
    </div>
  );
}
