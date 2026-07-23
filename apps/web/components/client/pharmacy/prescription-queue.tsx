'use client';

import type { PrescriptionResponse } from '@hms/shared-types';
import { Icon, Skeleton } from '@hms/ui';

import { PrescriptionQueueCard } from '#components/client/pharmacy/prescription-queue-card';
import {
  PrescriptionQueueToggle,
  type PrescriptionQueueFilter,
} from '#components/client/pharmacy/prescription-queue-toggle';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { EmptyState } from '#components/shared/empty-state';
import { resolvePrescriptionPriority } from '#lib/pharmacy/mock-prescription-priority';

const SKELETON_CARD_COUNT = 3;

type PrescriptionQueueProps = {
  prescriptions: PrescriptionResponse[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  filter: PrescriptionQueueFilter;
  onFilterChange: (filter: PrescriptionQueueFilter) => void;
  selectedPrescriptionId: string | null;
  onSelect: (prescription: PrescriptionResponse) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PrescriptionQueue({
  prescriptions,
  isPending,
  isError,
  isFetching,
  filter,
  onFilterChange,
  selectedPrescriptionId,
  onSelect,
  page,
  pageSize,
  total,
  onPageChange,
}: PrescriptionQueueProps) {
  const visiblePrescriptions =
    filter === 'STAT'
      ? prescriptions.filter(() => resolvePrescriptionPriority() === 'STAT')
      : prescriptions;

  return (
    <section aria-label="Incoming prescription queue" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
          <Icon name="pending_actions" size={20} />
          Incoming Prescription Queue
        </h2>
        <PrescriptionQueueToggle value={filter} onChange={onFilterChange} />
      </div>

      {isPending ? (
        <div className="space-y-3" data-testid="prescription-queue-skeleton">
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : null}

      {!isPending && isError && visiblePrescriptions.length === 0 ? (
        <EmptyState
          icon="error"
          title="Unable to load the prescription queue"
          description="Something went wrong while loading pending prescriptions. Please try again."
        />
      ) : null}

      {!isPending && !isError && visiblePrescriptions.length === 0 ? (
        filter === 'STAT' ? (
          <EmptyState
            icon="e911_emergency"
            title="No STAT prescriptions"
            description="There are no STAT-priority prescriptions in the queue right now."
          />
        ) : (
          <EmptyState
            icon="medication"
            title="No pending prescriptions"
            description="New prescriptions issued by doctors will appear here for verification."
          />
        )
      ) : null}

      {visiblePrescriptions.length > 0 ? (
        <div className="space-y-3">
          {visiblePrescriptions.map((prescription) => (
            <PrescriptionQueueCard
              key={prescription.id}
              prescription={prescription}
              isSelected={prescription.id === selectedPrescriptionId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}

      {filter === 'ALL' && !isPending && !isError ? (
        <NumberedPagination
          page={page}
          pageSize={pageSize}
          total={total}
          itemLabel="prescriptions"
          isDisabled={isFetching}
          onPageChange={onPageChange}
        />
      ) : null}
    </section>
  );
}
