'use client';

import { useRef, useState } from 'react';
import type { PrescriptionResponse } from '@hms/shared-types';
import { usePathname, useRouter } from 'next/navigation';

import { PharmacyStatCards } from '#components/client/pharmacy/pharmacy-stat-cards';
import { PrescriptionDetailsPanel } from '#components/client/pharmacy/prescription-details-panel';
import { PrescriptionQueue } from '#components/client/pharmacy/prescription-queue';
import type { PrescriptionQueueFilter } from '#components/client/pharmacy/prescription-queue-toggle';
import { PageHeader } from '#components/shared/page-header';
import { countLowStockMedications } from '#lib/pharmacy/low-stock';
import { buildPharmacySearchParams, type PharmacySearchParams } from '#lib/pharmacy/search-params';
import { useMedicationStock } from '#lib/pharmacy/use-medication-stock';
import { usePendingPrescriptions } from '#lib/pharmacy/use-pending-prescriptions';
import { ADMIN_ROUTE_METADATA } from '#lib/shell/route-metadata';

type PharmacyPanelProps = {
  initialQuery: PharmacySearchParams;
};

export function PharmacyPanel({ initialQuery }: PharmacyPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const metadata = ADMIN_ROUTE_METADATA.pharmacy;
  const prescriptionsQuery = usePendingPrescriptions(initialQuery);
  const stockQuery = useMedicationStock();
  const queueRef = useRef<HTMLDivElement | null>(null);
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

  function handleViewFullQueue(): void {
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={metadata.title}
        subtitle={metadata.subtitle}
        breadcrumbs={[...metadata.breadcrumbs]}
      />

      <PharmacyStatCards
        pendingTotal={prescriptionsQuery.meta?.total}
        isPendingLoading={prescriptionsQuery.isPending}
        isPendingError={prescriptionsQuery.isError}
        lowStockCount={countLowStockMedications(stockQuery.medications)}
        medicationsTotal={stockQuery.medications.length}
        isStockLoading={stockQuery.isPending}
        isStockError={stockQuery.isError}
        onViewFullQueue={handleViewFullQueue}
      />

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
          {prescriptionsQuery.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div ref={queueRef} className="min-w-0 flex-1 scroll-mt-24">
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
