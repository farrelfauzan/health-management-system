'use client';

import { useState } from 'react';
import type { ServiceTariffResponse } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';

import { ServiceTariffFormDialog } from '#components/client/billing/service-tariff-form-dialog';
import { ServiceTariffsTable } from '#components/client/billing/service-tariffs-table';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { INVOICES_PAGE_SIZE } from '#lib/billing/search-params';
import { useServiceTariffsList } from '#lib/billing/use-service-tariffs-list';

type TariffDialogState = {
  isOpen: boolean;
  tariff: ServiceTariffResponse | null;
};

export function ServiceTariffsPanel() {
  const ability = useAbility();
  const [page, setPage] = useState<number>(1);
  const [dialogState, setDialogState] = useState<TariffDialogState>({
    isOpen: false,
    tariff: null,
  });
  const tariffsQuery = useServiceTariffsList({ page, limit: INVOICES_PAGE_SIZE });
  const canManage = ability.can('write', 'ServiceTariff');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          The price list the invoice generator draws from.
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            onClick={() => setDialogState({ isOpen: true, tariff: null })}
          >
            <Icon name="add" size={18} />
            New Tariff
          </Button>
        ) : null}
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <ServiceTariffsTable
            tariffs={tariffsQuery.tariffs}
            isPending={tariffsQuery.isPending}
            isError={tariffsQuery.isError}
            canManage={canManage}
            onEdit={(tariff) => setDialogState({ isOpen: true, tariff })}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={INVOICES_PAGE_SIZE}
            total={tariffsQuery.meta?.total ?? 0}
            itemLabel="tariffs"
            isDisabled={tariffsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {dialogState.isOpen ? (
        <ServiceTariffFormDialog
          key={dialogState.tariff?.id ?? 'new'}
          open={dialogState.isOpen}
          tariff={dialogState.tariff}
          onOpenChange={(dialogOpen) => {
            if (!dialogOpen) {
              setDialogState({ isOpen: false, tariff: null });
            }
          }}
        />
      ) : null}
    </div>
  );
}
