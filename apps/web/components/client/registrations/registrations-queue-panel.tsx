'use client';

import { useState } from 'react';
import type { RegistrationListItem } from '@hms/shared-types';
import { Button, Can, Card, CardContent, Icon } from '@hms/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ChannelArrivalsPanel } from '#components/client/channel-arrivals/channel-arrivals-panel';
import { EncounterOpenDialog } from '#components/client/encounters/encounter-open-dialog';
import { RegistrationCreateDialog } from '#components/client/registrations/registration-create-dialog';
import { RegistrationTransitionDialog } from '#components/client/registrations/registration-transition-dialog';
import {
  RegistrationsFilterCard,
  type RegistrationsFilterValues,
} from '#components/client/registrations/registrations-filter-card';
import { RegistrationsTable } from '#components/client/registrations/registrations-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import type { RegistrationTransitionTarget } from '#lib/registrations/registration-transition-meta';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';
import {
  buildRegistrationsSearchParams,
  type RegistrationsSearchParams,
} from '#lib/registrations/search-params';
import { useRegistrationsList } from '#lib/registrations/use-registrations-list';

type PendingTransition = {
  registration: RegistrationListItem;
  target: RegistrationTransitionTarget;
};

type RegistrationsQueuePanelProps = {
  initialQuery: RegistrationsSearchParams;
  variant: RegistrationsViewVariant;
  openCreateOnMount?: boolean;
};

export function RegistrationsQueuePanel({
  initialQuery,
  variant,
  openCreateOnMount = false,
}: RegistrationsQueuePanelProps) {
  const t = useTranslations('operations.registrations');
  const router = useRouter();
  const pathname = usePathname();
  const registrationsQuery = useRegistrationsList(initialQuery);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(openCreateOnMount);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [encounterRegistration, setEncounterRegistration] = useState<RegistrationListItem | null>(
    null,
  );

  function navigateWithParams(next: RegistrationsSearchParams): void {
    router.replace(`${pathname}?${buildRegistrationsSearchParams(next).toString()}`);
  }

  function handleApplyFilters(filters: RegistrationsFilterValues): void {
    navigateWithParams({
      page: 1,
      limit: initialQuery.limit,
      ...filters,
    });
  }

  function handleResetFilters(): void {
    navigateWithParams({ page: 1, limit: initialQuery.limit });
  }

  function handleTransition(
    registration: RegistrationListItem,
    target: RegistrationTransitionTarget,
  ): void {
    setPendingTransition({ registration, target });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={variant === 'admin' ? t('title') : t('myTitle')}
        subtitle={variant === 'admin' ? t('subtitle') : t('mySubtitle')}
        breadcrumbs={[variant === 'admin' ? t('title') : t('myTitle')]}
        actions={
          <Can action="create" subject="Registration">
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Icon name="person_add" size={18} />
              {t('new')}
            </Button>
          </Can>
        }
      />

      {/* §5.2's arrival worklist, above the queue rather than beside it: the
          desk has to complete a chat-created record *before* checking the
          person in, so it belongs on the way to the queue. Admin-only, and it
          renders nothing when no chat booking is outstanding. */}
      {variant === 'admin' ? (
        <Can action="merge" subject="Patient">
          <ChannelArrivalsPanel />
        </Can>
      ) : null}

      <RegistrationsFilterCard
        key={`${initialQuery.search ?? ''}|${initialQuery.status ?? ''}|${initialQuery.doctorId ?? ''}|${initialQuery.registeredFrom ?? ''}|${initialQuery.registeredTo ?? ''}`}
        initialQuery={initialQuery}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {registrationsQuery.error && registrationsQuery.registrations.length > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {t('errorTitle')}
        </p>
      ) : null}

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <RegistrationsTable
            registrations={registrationsQuery.registrations}
            variant={variant}
            isPending={registrationsQuery.isPending}
            isError={registrationsQuery.isError}
            onTransition={handleTransition}
            onOpenEncounter={setEncounterRegistration}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={initialQuery.page}
            pageSize={initialQuery.limit}
            total={registrationsQuery.meta?.total ?? 0}
            itemLabel="registrations"
            isDisabled={registrationsQuery.isFetching}
            onPageChange={(nextPage) => navigateWithParams({ ...initialQuery, page: nextPage })}
          />
        </CardContent>
      </Card>

      {isCreateDialogOpen ? (
        <RegistrationCreateDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          variant={variant}
        />
      ) : null}

      {encounterRegistration ? (
        <EncounterOpenDialog
          key={encounterRegistration.id}
          open={Boolean(encounterRegistration)}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setEncounterRegistration(null);
            }
          }}
          registration={encounterRegistration}
        />
      ) : null}

      {pendingTransition ? (
        <RegistrationTransitionDialog
          key={`${pendingTransition.registration.id}-${pendingTransition.target}`}
          open={Boolean(pendingTransition)}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setPendingTransition(null);
            }
          }}
          registration={pendingTransition.registration}
          targetStatus={pendingTransition.target}
        />
      ) : null}
    </div>
  );
}
