'use client';

import type { TenTChecklistItem } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { TEN_T_ITEM_ORDER } from '#lib/maternal-care/ten-t-item-order';

type TenTChecklistListProps = {
  checklist: TenTChecklistItem[];
};

/**
 * The ten items as chips. Each says where its answer came from, so a midwife
 * reading "Belum" knows whether to take a measurement, order a test or write a
 * note — rather than looking for a field on this card that does not exist.
 */
export function TenTChecklistList({ checklist }: TenTChecklistListProps) {
  const t = useTranslations('maternalCare.examination');
  const byCode = new Map(checklist.map((item) => [item.code, item]));

  return (
    <ul className="flex flex-wrap gap-2">
      {TEN_T_ITEM_ORDER.map((code) => {
        const item = byCode.get(code);
        const isDone = item?.isDone ?? false;
        return (
          <li
            key={code}
            className={`rounded-full px-3 py-1 text-xs ${
              isDone ? 'bg-success-tint text-success' : 'bg-slate-100 text-slate-600'
            }`}
            title={item === undefined ? undefined : t(`sources.${item.source}`)}
          >
            {t(`items.${code}`)} · {isDone ? t('done') : t('notDone')}
          </li>
        );
      })}
    </ul>
  );
}
