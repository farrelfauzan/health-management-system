'use client';

import type { MidwifeFormularyPreviewItemResponse } from '@hms/shared-types';
import { Badge, Checkbox, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

type MidwifeFormularyItemRowProps = {
  entry: MidwifeFormularyPreviewItemResponse;
  selectedIds: ReadonlySet<string>;
  applicableIds: ReadonlySet<string>;
  onToggle: (medicationId: string, isChecked: boolean) => void;
};

export function MidwifeFormularyItemRow({
  entry,
  selectedIds,
  applicableIds,
  onToggle,
}: MidwifeFormularyItemRowProps) {
  const t = useTranslations('pharmacyInventory.midwifeFormulary');

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{entry.item.displayName}</p>
        <p className="text-xs text-slate-500">{entry.item.regulationBasis}</p>
      </div>
      <ul className="space-y-1.5">
        {entry.matches.map((match) => {
          const checkboxId = `midwife-formulary-${entry.item.code}-${match.medicationId}`;
          const isApplicable = applicableIds.has(match.medicationId);
          const isDisabled = match.isMidwifePrescribable || !isApplicable;
          const isChecked =
            !match.isMidwifePrescribable && isApplicable && selectedIds.has(match.medicationId);
          return (
            <li key={match.medicationId} className="flex flex-wrap items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={isChecked}
                disabled={isDisabled}
                onCheckedChange={(checked) => onToggle(match.medicationId, checked === true)}
              />
              <Label htmlFor={checkboxId} className="text-sm font-normal">
                {match.name}
              </Label>
              {match.kfaCode ? (
                <span className="font-mono text-xs text-slate-500">{match.kfaCode}</span>
              ) : null}
              <Badge variant="outline">{t(`matchedBy.${match.matchedBy}`)}</Badge>
              {match.isMidwifePrescribable ? (
                <Badge variant="secondary">{t('alreadyFlagged')}</Badge>
              ) : null}
              {!match.isMidwifePrescribable && !isApplicable ? (
                <span className="text-xs text-slate-500">{t('keywordHint')}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </li>
  );
}
