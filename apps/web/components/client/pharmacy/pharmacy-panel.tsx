'use client';

import { useState } from 'react';
import type { PrescriptionResponse } from '@hms/shared-types';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PrescriptionDetailsPanel } from '#components/client/pharmacy/prescription-details-panel';
import { PrescriptionQueue } from '#components/client/pharmacy/prescription-queue';
import type { PrescriptionQueueFilter } from '#components/client/pharmacy/prescription-queue-toggle';
import { buildPharmacySearchParams, type PharmacySearchParams } from '#lib/pharmacy/search-params';
import { usePendingPrescriptions } from '#lib/pharmacy/use-pending-prescriptions';

type PharmacyPanelProps = {
  initialQuery: PharmacySearchParams;
};

export function PharmacyPanel({ initialQuery }: PharmacyPanelProps) {
  const t = useTranslations('operations.pharmacy');
  const router = useRouter();
  const pathname = usePathname();
  const prescriptionsQuery = usePendingPrescriptions(initialQuery);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<PrescriptionQueueFilter>('ALL');
  const [dispenseMessage, setDispenseMessage] = useState<string | null>(null);
  const selectedPrescription =
    prescriptionsQuery.prescriptions.find(
      (prescription) => prescription.id === selectedPrescriptionId,
    ) ?? null;

  function navigateWithParams(next: PharmacySearchParams): void {
    router.replace(`${pathname}?${buildPharmacySearchParams(next).toString()}`);
  }

  function handleSelect(prescription: PrescriptionResponse): void {
    setSelectedPrescriptionId(prescription.id);
    setDispenseMessage(null);
  }

  function handleDispensed(message: string): void {
    setSelectedPrescriptionId(null);
    setDispenseMessage(message);
  }

  return (
    <div className="space-y-6">
      {dispenseMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          {dispenseMessage}
        </p>
      ) : null}

      {prescriptionsQuery.error && prescriptionsQuery.prescriptions.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {t('queueErrorTitle')}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <PrescriptionQueue
            prescriptions={prescriptionsQuery.prescriptions}
            isPending={prescriptionsQuery.isPending}
            isError={prescriptionsQuery.isError}
            isFetching={prescriptionsQuery.isFetching}
            filter={queueFilter}
            onFilterChange={setQueueFilter}
            selectedPrescriptionId={selectedPrescriptionId}
            onSelect={handleSelect}
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={prescriptionsQuery.meta?.total ?? 0}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </div>
        <aside className="w-full xl:w-[420px] xl:shrink-0">
          <PrescriptionDetailsPanel
            key={selectedPrescription?.id ?? 'no-selection'}
            prescription={selectedPrescription}
            onDispensed={handleDispensed}
          />
        </aside>
      </div>
    </div>
  );
}
