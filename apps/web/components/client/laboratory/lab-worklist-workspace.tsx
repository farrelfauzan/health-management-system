'use client';

import { useState } from 'react';
import type { LabWorklistBucketValue, LabWorklistItem } from '@hms/shared-types';
import { Button, Icon, Label, Tabs, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';

import { LabCollectDialog } from '#components/client/laboratory/lab-collect-dialog';
import { LabWorklistTable } from '#components/client/laboratory/lab-worklist-table';
import {
  DEFAULT_LAB_WORKLIST_BUCKET,
  LAB_WORKLIST_BUCKETS,
} from '#lib/laboratory/lab-worklist-buckets';
import { LocalizedDatePicker } from '#components/client/shared/localized-date-picker';
import { useLabWorklist } from '#lib/laboratory/use-lab-worklist';
import { useTabSearchParam } from '#lib/navigation/use-tab-search-param';
import {
  buildLabWorklistSearchParams,
  type LabWorklistSearchParams,
} from '#lib/laboratory/worklist-search-params';

type LabWorklistWorkspaceProps = {
  initialQuery: LabWorklistSearchParams;
};

/**
 * The analyst's whole day (`P18-T08`): four tabs, a day filter, and the list
 * that re-reads itself every half minute. The tab and the day live in the URL
 * so a reload lands where the bench left off.
 */
export function LabWorklistWorkspace({ initialQuery }: LabWorklistWorkspaceProps) {
  const t = useTranslations('operations.laboratory.worklist');
  const format = useFormatter();
  const router = useRouter();
  const ability = useAbility();
  // The bucket is a tab, so it pushes a history entry and Back returns to the
  // previous one (SJ-162); the day is a filter and keeps replacing in place.
  const { tab: bucket, setTab: setBucket } = useTabSearchParam<LabWorklistBucketValue>({
    key: 'bucket',
    allowed: LAB_WORKLIST_BUCKETS,
    fallback: DEFAULT_LAB_WORKLIST_BUCKET,
    initialTab: initialQuery.bucket,
  });
  const [date, setDate] = useState<string | undefined>(initialQuery.date);
  const [collectTarget, setCollectTarget] = useState<LabWorklistItem | null>(null);
  const query: LabWorklistSearchParams = { bucket, ...(date ? { date } : {}) };
  const worklist = useLabWorklist(query);

  function updateQuery(next: LabWorklistSearchParams): void {
    setDate(next.date);
    router.replace(`/admin/laboratory?${buildLabWorklistSearchParams(next).toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as LabWorklistBucketValue)}>
          <TabsList>
            {LAB_WORKLIST_BUCKETS.map((bucket) => (
              <TabsTrigger key={bucket} value={bucket}>
                {t(`buckets.${bucket}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="lab-worklist-date" className="text-sm text-slate-600 font-normal">
            {t('dateLabel')}
          </Label>
          <LocalizedDatePicker
            id="lab-worklist-date"
            className="w-40"
            value={query.date ?? ''}
            onValueChange={(value) =>
              updateQuery({
                bucket: query.bucket,
                ...(value ? { date: value } : {}),
              })
            }
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => updateQuery({ bucket: query.bucket, date: toTodayIsoDate() })}
          >
            {t('today')}
          </Button>
          {query.date ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => updateQuery({ bucket: query.bucket })}
            >
              {t('anyDay')}
            </Button>
          ) : null}
          {ability.can('write', 'LabOrder') ? (
            <Button asChild type="button" size="sm" variant="ghost">
              <Link href="/admin/laboratory/intake">
                <Icon name="add" size={16} />
                {t('intakeLink')}
              </Link>
            </Button>
          ) : null}
          {ability.can('read', 'LabTest') ? (
            <Button asChild type="button" size="sm" variant="ghost">
              <Link href="/admin/settings/laboratory">
                <Icon name="tune" size={16} />
                {t('catalogLink')}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <LabWorklistTable
        items={worklist.items}
        bucket={query.bucket}
        isPending={worklist.isPending}
        isError={worklist.isError}
        onCollect={setCollectTarget}
      />
      <p className="text-xs text-slate-500" aria-live="polite">
        {worklist.isFetching
          ? t('refreshing')
          : worklist.dataUpdatedAt
            ? t('refreshedAt', {
                time: format.dateTime(new Date(worklist.dataUpdatedAt), { timeStyle: 'short' }),
              })
            : null}
      </p>
      <LabCollectDialog item={collectTarget} onClose={() => setCollectTarget(null)} />
    </div>
  );
}

function toTodayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
