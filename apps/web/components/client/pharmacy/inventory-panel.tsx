'use client';

import { useDeferredValue, useState } from 'react';
import type { ExpiryReportResponse, InventorySummaryResponse, MedicationResponse, MedicationsListMeta } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAbility,
} from '@hms/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { ExpiryReportTable } from '#components/client/pharmacy/expiry-report-table';
import { InventoryStatCards } from '#components/client/pharmacy/inventory-stat-cards';
import { MedicationFormDialog } from '#components/client/pharmacy/medication-form-dialog';
import { ReceiveStockDialog } from '#components/client/pharmacy/receive-stock-dialog';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import {
  getInventoryControllerGetExpiryReportV1QueryKey,
  getInventoryControllerGetSummaryV1QueryKey,
  inventoryControllerGetExpiryReportV1,
  inventoryControllerGetSummaryV1,
} from '#lib/api/generated/pharmacy-inventory/pharmacy-inventory';
import {
  getMedicationControllerListMedicationsV1QueryKey,
  medicationControllerListMedicationsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import type { MedicationControllerListMedicationsV1Params } from '#lib/api/generated/model/medicationControllerListMedicationsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';
import { parseExpiryReportItems } from '#lib/pharmacy/expiry-report';
import { useMedicationStock } from '#lib/pharmacy/use-medication-stock';
import { formatStatusLabel } from '#lib/shared/status-label';

const PAGE_SIZE = 10;
const EXPIRY_DAYS = 30;

export function InventoryPanel() {
  const t = useTranslations('pharmacyInventory');
  const locale = useLocale();
  const format = useFormatter();
  const ability = useAbility();
  const canCreateMedication = ability.can('create', 'Medication');
  const canUpdateMedication = ability.can('update', 'Medication');
  const canReceiveStock = ability.can('write', 'Inventory');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [category, setCategory] = useState('ALL');
  const [reorderOnly, setReorderOnly] = useState(false);
  const [editingMedication, setEditingMedication] = useState<MedicationResponse | null | undefined>(undefined);
  const [receiptMedicationId, setReceiptMedicationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const medicationParams: MedicationControllerListMedicationsV1Params = {
    page,
    limit: PAGE_SIZE,
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(category !== 'ALL' ? { category: category as MedicationControllerListMedicationsV1Params['category'] } : {}),
    ...(reorderOnly ? { reorderOnly: 'true' } : {}),
  };
  const medicationsQuery = useApiQuery<MedicationResponse[]>({
    queryKey: getMedicationControllerListMedicationsV1QueryKey(medicationParams),
    queryFn: (signal) => medicationControllerListMedicationsV1(medicationParams, signal),
    errorMessage: t('catalogLoadError'),
  });
  const medicationOptionsQuery = useMedicationStock();
  const summaryQuery = useApiQuery<InventorySummaryResponse>({
    queryKey: getInventoryControllerGetSummaryV1QueryKey(),
    queryFn: inventoryControllerGetSummaryV1,
    errorMessage: t('inventoryLoadError'),
  });
  const expiryParams = { days: EXPIRY_DAYS };
  const expiryQuery = useApiQuery<ExpiryReportResponse>({
    queryKey: getInventoryControllerGetExpiryReportV1QueryKey(expiryParams),
    queryFn: (signal) => inventoryControllerGetExpiryReportV1(expiryParams, signal),
    errorMessage: t('inventoryLoadError'),
  });
  const medications = medicationsQuery.data ?? [];
  const meta = medicationsQuery.meta as MedicationsListMeta | undefined;
  const expiryItems = parseExpiryReportItems(expiryQuery.data?.items ?? []);

  function showMessage(value: string): void {
    setMessage(value);
  }

  return (
    <div className="space-y-6">
      <InventoryStatCards summary={summaryQuery.data} expiringCount={expiryItems.filter((item) => item.expiryStatus === 'EXPIRING').length} isLoading={summaryQuery.isPending || expiryQuery.isPending} isError={summaryQuery.isError || expiryQuery.isError} />
      {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      <Card className="gap-0 overflow-hidden rounded-xl border-slate-200 py-0 shadow-none">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-heading text-base font-semibold text-slate-900">{t('catalogTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('catalogDescription')}</p></div>
          <div className="flex flex-wrap gap-2">
            {canReceiveStock ? <Button type="button" variant="outline" onClick={() => setReceiptMedicationId('')}><Icon name="inventory" size={18} />{t('receiveStock')}</Button> : null}
            {canCreateMedication ? <Button type="button" onClick={() => setEditingMedication(null)}><Icon name="add" size={18} />{t('addMedication')}</Button> : null}
          </div>
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_240px_auto]">
            <Input aria-label={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('allCategories')}</SelectItem>{['OBAT_BEBAS','OBAT_BEBAS_TERBATAS','OBAT_KERAS','PSIKOTROPIKA','NARKOTIKA','OBAT_HERBAL','SUPLEMEN','ALAT_KESEHATAN'].map((value) => <SelectItem key={value} value={value}>{formatStatusLabel(value, locale)}</SelectItem>)}</SelectContent></Select>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><Checkbox checked={reorderOnly} onCheckedChange={(checked) => { setReorderOnly(checked === true); setPage(1); }} />{t('reorderOnly')}</label>
          </div>
          {medicationsQuery.isError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{t('catalogLoadError')}</p> : null}
          {!medicationsQuery.isPending && !medicationsQuery.isError && medications.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{t('emptyCatalog')}</p> : null}
          {medications.length > 0 ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('code')}</TableHead><TableHead>{t('name')}</TableHead><TableHead>{t('category')}</TableHead><TableHead>{t('stock')}</TableHead><TableHead>{t('reorderLevel')}</TableHead><TableHead>{t('actions')}</TableHead></TableRow></TableHeader><TableBody>{medications.map((medication) => <TableRow key={medication.id}><TableCell className="font-mono text-xs">{medication.code}</TableCell><TableCell><p className="font-medium">{medication.name}</p><p className="text-xs text-slate-500">{[medication.form, medication.strength, medication.unit].filter(Boolean).join(' · ')}</p></TableCell><TableCell>{medication.category ? formatStatusLabel(medication.category, locale) : '-'}</TableCell><TableCell className={medication.needsReorder ? 'font-semibold text-danger' : ''}>{format.number(medication.stockQty)}</TableCell><TableCell>{format.number(medication.reorderLevel)}</TableCell><TableCell><div className="flex gap-1">{canUpdateMedication ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`${t('editMedication')} ${medication.name}`} onClick={() => setEditingMedication(medication)}><Icon name="edit" size={17} /></Button> : null}{canReceiveStock ? <Button type="button" size="icon-sm" variant="ghost" aria-label={`${t('receiveStock')} ${medication.name}`} onClick={() => setReceiptMedicationId(medication.id)}><Icon name="add_box" size={17} /></Button> : null}</div></TableCell></TableRow>)}</TableBody></Table></div> : null}
          <NumberedPagination page={page} pageSize={PAGE_SIZE} total={meta?.total ?? 0} onPageChange={setPage} isDisabled={medicationsQuery.isFetching} />
        </CardContent>
      </Card>
      {expiryQuery.isError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{t('inventoryLoadError')}</p> : <ExpiryReportTable items={expiryItems} throughDate={expiryQuery.data?.throughDate} />}
      {editingMedication !== undefined ? <MedicationFormDialog key={editingMedication?.id ?? 'new'} open onOpenChange={(open) => { if (!open) setEditingMedication(undefined); }} medication={editingMedication} onSaved={showMessage} /> : null}
      {receiptMedicationId !== null ? <ReceiveStockDialog key={receiptMedicationId || 'select'} open onOpenChange={(open) => { if (!open) setReceiptMedicationId(null); }} medications={medicationOptionsQuery.medications} initialMedicationId={receiptMedicationId || undefined} onSaved={showMessage} /> : null}
    </div>
  );
}
