'use client';

import { useState } from 'react';
import type { LabWorklistBucketValue, LabWorklistItem } from '@hms/shared-types';
import { Button, Icon, Input, Tabs, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';

import { LabCollectDialog } from '#components/client/laboratory/lab-collect-dialog';
import { LabWorklistTable } from '#components/client/laboratory/lab-worklist-table';
import { LAB_WORKLIST_BUCKETS } from '#lib/laboratory/lab-worklist-buckets';
import { useLabWorklist } from '#lib/laboratory/use-lab-worklist';
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
  const [query, setQuery] = useState<LabWorklistSearchParams>(initialQuery);
  const [collectTarget, setCollectTarget] = useState<LabWorklistItem | null>(null);
  const worklist = useLabWorklist(query);

  function updateQuery(next: LabWorklistSearchParams): void {
    setQuery(next);
    router.replace(`/admin/laboratory?${buildLabWorklistSearchParams(next).toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={query.bucket}
          onValueChange={(value) =>
            updateQuery({ ...query, bucket: value as LabWorklistBucketValue })
          }
        >
          <TabsList>
            {LAB_WORKLIST_BUCKETS.map((bucket) => (
              <TabsTrigger key={bucket} value={bucket}>
                {t(`buckets.${bucket}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {t('dateLabel')}
            <Input
              type="date"
              className="w-40"
              value={query.date ?? ''}
              onChange={(event) =>
                updateQuery({
                  bucket: query.bucket,
                  ...(event.target.value ? { date: event.target.value } : {}),
                })
              }
            />
          </label>
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
