'use client';

import { useState } from 'react';
import { Input, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabResultsGroup } from '#components/client/laboratory/lab-results-group';
import { EmptyState } from '#components/shared/empty-state';
import { groupLabResultsByOrder } from '#lib/laboratory/group-lab-results-by-order';
import { usePatientLabResults } from '#lib/laboratory/use-patient-lab-results';

/** Enough to cover a chronic patient's recent year without paging. */
const HISTORY_LIMIT = 100;

type PatientLabHistoryPanelProps = {
  patientId: string;
};

/**
 * Riwayat Lab: every released value this patient has, across visits
 * (`P18-T07`).
 *
 * Read-only by design. Correcting a value is the laboratory's act and needs the
 * verify key; a doctor reading history here has no business editing it, and
 * offering the control would suggest otherwise.
 *
 * The filter narrows by test code client-side rather than refetching: the list
 * is already loaded and bounded, and a request per keystroke would be slower
 * than the filter it replaced.
 */
export function PatientLabHistoryPanel({ patientId }: PatientLabHistoryPanelProps) {
  const t = useTranslations('clinical');
  const [filter, setFilter] = useState<string>('');
  const historyQuery = usePatientLabResults({ patientId, limit: HISTORY_LIMIT });

  if (historyQuery.isPending) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? historyQuery.labResults.filter(
        (result) =>
          result.testName.toLowerCase().includes(needle) ||
          result.testCode.toLowerCase().includes(needle),
      )
    : historyQuery.labResults;

  if (historyQuery.labResults.length === 0) {
    return (
      <EmptyState
        icon="labs"
        title={t('encounters.laboratory.history.emptyTitle')}
        description={t('encounters.laboratory.history.emptyDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={t('encounters.laboratory.history.filterPlaceholder')}
      />
      {filtered.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          {t('encounters.laboratory.history.noMatches')}
        </p>
      ) : (
        groupLabResultsByOrder(filtered).map((group) => (
          <LabResultsGroup key={group.labOrderId} group={group} patientId={patientId} />
        ))
      )}
    </div>
  );
}
