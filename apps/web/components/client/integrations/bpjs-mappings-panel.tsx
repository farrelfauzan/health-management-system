'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BpjsReferenceItemView,
  BpjsReferenceSyncResultView,
  MedicationResponse,
} from '@hms/shared-types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  useAbility,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import {
  bpjsMappingControllerSetDoctorMappingV1,
  bpjsMappingControllerSetMedicationMappingV1,
  bpjsMappingControllerSetSpecialtyMappingV1,
  bpjsReferenceControllerSearchCatalogRemoteV1,
  bpjsReferenceControllerSyncCatalogsV1,
  getBpjsMappingControllerGetOverviewV1QueryKey,
  getBpjsReferenceControllerGetStatusV1QueryKey,
  getBpjsReferenceControllerSearchCatalogV1QueryKey,
} from '#lib/api/generated/bpjs-pcare/bpjs-pcare';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import {
  useBpjsMappingOverview,
  useBpjsReferenceCatalog,
  useBpjsReferenceStatus,
} from '#lib/integrations/use-integration-queries';
import { useMedicationStock } from '#lib/pharmacy/use-medication-stock';
import { formatStatusLabel } from '#lib/shared/status-label';

type MappingTarget =
  | { kind: 'doctor'; id: string; code: string | null }
  | { kind: 'specialty'; id: string; code: string | null }
  | { kind: 'medication'; id: string; code: string | null };

const UNMAPPED = '__UNMAPPED__';

export function BpjsMappingsPanel() {
  const t = useTranslations('operations.integrations');
  const format = useFormatter();
  const ability = useAbility();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('doctors');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [dphoSearch, setDphoSearch] = useState('');
  const canReadReferences = ability.can('read', 'BpjsReference');
  const canSyncReferences = ability.can('sync', 'BpjsReference');
  const overviewQuery = useBpjsMappingOverview();
  const statusQuery = useBpjsReferenceStatus(canReadReferences);
  const medicationsQuery = useMedicationStock();
  const doctorReferences = useBpjsReferenceCatalog(
    'dokter',
    referenceSearch,
    canReadReferences && tab === 'doctors',
  );
  const poliReferences = useBpjsReferenceCatalog(
    'poli',
    referenceSearch,
    canReadReferences && tab === 'specialties',
  );
  const dphoReferences = useBpjsReferenceCatalog(
    'dpho',
    dphoSearch,
    canReadReferences && tab === 'medications',
  );

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await bpjsReferenceControllerSyncCatalogsV1();
      return parseApiSuccess<BpjsReferenceSyncResultView>(response, t('labels.syncError')).data;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getBpjsReferenceControllerGetStatusV1QueryKey(),
        }),
        queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).startsWith('/api/v1/bpjs/reference/'),
        }),
      ]);
      const count = result.catalogs.reduce((total, catalog) => total + catalog.itemCount, 0);
      toast.success(`BPJS reference catalogs synchronized (${count} items).`);
    },
    onError: (error) => notifyApiError(error, t('labels.syncError')),
  });

  const mappingMutation = useMutation({
    mutationFn: async (target: MappingTarget) => {
      if (target.kind === 'doctor') {
        await bpjsMappingControllerSetDoctorMappingV1(target.id, {
          bpjsDoctorCode: target.code,
        });
      } else if (target.kind === 'specialty') {
        await bpjsMappingControllerSetSpecialtyMappingV1(target.id, {
          bpjsPoliCode: target.code,
        });
      } else {
        await bpjsMappingControllerSetMedicationMappingV1(target.id, {
          dphoCode: target.code,
        });
      }
    },
    onSuccess: async (_, target) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getBpjsMappingControllerGetOverviewV1QueryKey(),
        }),
        target.kind === 'medication'
          ? queryClient.invalidateQueries({ queryKey: ['/api/v1/medications'] })
          : Promise.resolve(),
      ]);
      toast.success('BPJS mapping updated.');
    },
    onError: (error) => notifyApiError(error, t('labels.mappingError')),
  });

  const remoteDphoMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await bpjsReferenceControllerSearchCatalogRemoteV1('dpho', { query });
      return parseApiSuccess<BpjsReferenceItemView[]>(response, t('labels.searchError')).data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [getBpjsReferenceControllerSearchCatalogV1QueryKey('dpho')[0]],
      });
    },
    onError: (error) => notifyApiError(error, t('labels.searchError')),
  });

  async function handleDphoSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (dphoSearch.trim().length < 2) {
      toast.error('Enter at least two characters to search DPHO.');
      return;
    }
    await remoteDphoMutation.mutateAsync(dphoSearch.trim()).catch(() => undefined);
  }

  const references =
    tab === 'doctors'
      ? (doctorReferences.data ?? [])
      : tab === 'specialties'
        ? (poliReferences.data ?? [])
        : (dphoReferences.data ?? []);

  function mappingSelect(
    target: Omit<MappingTarget, 'code'>,
    currentCode: string | null | undefined,
  ) {
    return (
      <Select
        value={currentCode ?? UNMAPPED}
        disabled={mappingMutation.isPending}
        onValueChange={(value) =>
          mappingMutation.mutate({
            ...target,
            code: value === UNMAPPED ? null : value,
          } as MappingTarget)
        }
      >
        <SelectTrigger className="min-w-64" aria-label={t('labels.mapping')}>
          <SelectValue placeholder={t('selectCode')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNMAPPED}>{t('labels.notMapped')}</SelectItem>
          {references.map((reference) => (
            <SelectItem key={reference.code} value={reference.code}>
              {reference.code} · {reference.display}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const syncableStatuses = statusQuery.data?.filter((item) => item.isSyncable) ?? [];
  const lastSyncedAt = syncableStatuses
    .map((item) => item.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('labels.referenceCatalogs')}</CardTitle>
            <CardDescription>
              Keep PCare doctor and clinic catalogs current before assigning local mappings.
            </CardDescription>
          </div>
          {canSyncReferences ? (
            <Button
              type="button"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <Icon name="sync" size={17} />
              {syncMutation.isPending ? t('synchronizing') : t('syncReferences')}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(statusQuery.data ?? []).map((status) => (
              <Badge key={status.catalog} variant="outline">
                {formatStatusLabel(status.catalog)} · {status.itemCount}
              </Badge>
            ))}
            {!statusQuery.isPending && statusQuery.data?.length === 0 ? (
              <span className="text-sm text-slate-500">{t('labels.notSynchronized')}</span>
            ) : null}
          </div>
          {lastSyncedAt ? (
            <p className="mt-3 text-xs text-slate-500">
              {t('lastSync', {
                date: format.dateTime(new Date(lastSyncedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('labels.localMappings')}</CardTitle>
          <CardDescription>
            Link doctors, specialties, and formulary items to validated PCare reference codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setReferenceSearch('');
            }}
          >
            <TabsList>
              <TabsTrigger value="doctors">{t('labels.doctors')}</TabsTrigger>
              <TabsTrigger value="specialties">{t('labels.specialties')}</TabsTrigger>
              <TabsTrigger value="medications">{t('labels.medications')}</TabsTrigger>
            </TabsList>
            <div className="my-4">
              {tab === 'medications' && canSyncReferences ? (
                <form
                  className="flex max-w-xl gap-2"
                  onSubmit={(event) => void handleDphoSearch(event)}
                >
                  <Input
                    aria-label={t('searchDpho')}
                    placeholder={t('searchDphoPlaceholder')}
                    value={dphoSearch}
                    onChange={(event) => setDphoSearch(event.target.value)}
                  />
                  <Button type="submit" variant="outline" disabled={remoteDphoMutation.isPending}>
                    Search PCare
                  </Button>
                </form>
              ) : tab !== 'medications' ? (
                <Input
                  className="max-w-md"
                  aria-label={t('labels.filterReferences')}
                  placeholder={t('labels.filterReferences')}
                  value={referenceSearch}
                  onChange={(event) => setReferenceSearch(event.target.value)}
                />
              ) : null}
            </div>

            <TabsContent value="doctors">
              <MappingTable
                rows={(overviewQuery.data?.doctors ?? []).map((doctor) => ({
                  id: doctor.doctorId,
                  primary: doctor.fullName,
                  secondary: doctor.specialtyName,
                  mapping: mappingSelect(
                    { kind: 'doctor', id: doctor.doctorId },
                    doctor.bpjsDoctorCode,
                  ),
                }))}
                loading={overviewQuery.isPending}
              />
            </TabsContent>
            <TabsContent value="specialties">
              <MappingTable
                rows={(overviewQuery.data?.specialties ?? []).map((specialty) => ({
                  id: specialty.specialtyId,
                  primary: specialty.name,
                  secondary: 'Local specialty',
                  mapping: mappingSelect(
                    { kind: 'specialty', id: specialty.specialtyId },
                    specialty.bpjsPoliCode,
                  ),
                }))}
                loading={overviewQuery.isPending}
              />
            </TabsContent>
            <TabsContent value="medications">
              <MappingTable
                rows={medicationsQuery.medications.map((medication: MedicationResponse) => ({
                  id: medication.id,
                  primary: medication.name,
                  secondary: `${medication.code}${medication.strength ? ` · ${medication.strength}` : ''}`,
                  mapping: mappingSelect(
                    { kind: 'medication', id: medication.id },
                    medication.dphoCode,
                  ),
                }))}
                loading={medicationsQuery.isPending}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

type MappingTableProps = {
  rows: Array<{ id: string; primary: string; secondary: string; mapping: ReactNode }>;
  loading: boolean;
};

function MappingTable({ rows, loading }: MappingTableProps) {
  const t = useTranslations('operations.integrations');
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('labels.localRecord')}</TableHead>
            <TableHead>{t('labels.bpjsReference')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="h-24 text-center text-slate-500">
                {loading ? t('loadingMappings') : t('noLocalRecords')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium text-slate-900">{row.primary}</p>
                  <p className="text-xs text-slate-500">{row.secondary}</p>
                </TableCell>
                <TableCell>{row.mapping}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
