'use client';

import { useState } from 'react';
import type { AdmissionResponse, AdmissionStatusValue } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdmissionDetailDialog } from '#components/client/admissions/admission-detail-dialog';
import { AdmissionsTable } from '#components/client/admissions/admissions-table';
import { AdmitPatientDialog } from '#components/client/admissions/admit-patient-dialog';
import { CancelAdmissionDialog } from '#components/client/admissions/cancel-admission-dialog';
import { DischargeAdmissionDialog } from '#components/client/admissions/discharge-admission-dialog';
import { TransferAdmissionDialog } from '#components/client/admissions/transfer-admission-dialog';
import { WardFilterSelect } from '#components/client/rooms/ward-filter-select';
import { NumberedPagination } from '#components/client/shared/numbered-pagination';
import { PageHeader } from '#components/shared/page-header';
import { useAdmissionsList } from '#lib/admissions/use-admissions-list';
import { formatStatusLabel } from '#lib/shared/status-label';
import { ROOM_INVENTORY_PAGE_SIZE } from '#lib/rooms/page-size';

const ADMISSION_STATUS_OPTIONS: AdmissionStatusValue[] = ['ADMITTED', 'DISCHARGED', 'CANCELLED'];

const ALL_STATUSES_VALUE = 'all';

type ActiveDialog = 'admit' | 'cancel' | 'detail' | 'discharge' | 'transfer' | null;

export function AdmissionsWorkspace() {
  const t = useTranslations('operations');
  const ability = useAbility();
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [status, setStatus] = useState<AdmissionStatusValue | undefined>('ADMITTED');
  const [wardId, setWardId] = useState<string | undefined>(undefined);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [selectedAdmission, setSelectedAdmission] = useState<AdmissionResponse | null>(null);
  const admissionsQuery = useAdmissionsList({
    page,
    limit: ROOM_INVENTORY_PAGE_SIZE,
    ...(status ? { status } : {}),
    ...(wardId ? { wardId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const canAdmit = ability.can('admit', 'Admission');
  const canTransfer = ability.can('transfer', 'Admission');
  const canDischarge = ability.can('discharge', 'Admission');
  const canCancel = ability.can('cancel', 'Admission');

  function openDialogFor(admission: AdmissionResponse, dialog: ActiveDialog): void {
    setSelectedAdmission(admission);
    setActiveDialog(dialog);
  }

  function closeDialog(): void {
    setActiveDialog(null);
    setSelectedAdmission(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admissions.title')}
        subtitle={t('admissions.subtitle')}
        breadcrumbs={[t('admissions.title')]}
        actions={
          canAdmit ? (
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setActiveDialog('admit')}
            >
              <Icon name="add" size={18} />
              {t('admissions.admitPatient')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-64"
          placeholder={t('admissions.search')}
          aria-label={t('admissions.search')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status ?? ALL_STATUSES_VALUE}
          onValueChange={(value) => {
            setStatus(value === ALL_STATUSES_VALUE ? undefined : (value as AdmissionStatusValue));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label={t('admissions.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES_VALUE}>{t('admissions.allStatuses')}</SelectItem>
            {ADMISSION_STATUS_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {formatStatusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WardFilterSelect
          value={wardId}
          onChange={(nextWardId) => {
            setWardId(nextWardId);
            setPage(1);
          }}
        />
      </div>

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <AdmissionsTable
            admissions={admissionsQuery.admissions}
            isPending={admissionsQuery.isPending}
            isError={admissionsQuery.isError}
            canTransfer={canTransfer}
            canDischarge={canDischarge}
            canCancel={canCancel}
            onOpen={(admission) => openDialogFor(admission, 'detail')}
            onTransfer={(admission) => openDialogFor(admission, 'transfer')}
            onDischarge={(admission) => openDialogFor(admission, 'discharge')}
            onCancel={(admission) => openDialogFor(admission, 'cancel')}
          />
          <NumberedPagination
            className="border-t border-slate-100 px-4 py-3"
            page={page}
            pageSize={ROOM_INVENTORY_PAGE_SIZE}
            total={admissionsQuery.meta?.total ?? 0}
            itemLabel="admissions"
            isDisabled={admissionsQuery.isFetching}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {activeDialog === 'admit' ? (
        <AdmitPatientDialog
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
      {selectedAdmission && activeDialog === 'detail' ? (
        <AdmissionDetailDialog
          open
          admission={selectedAdmission}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
      {selectedAdmission && activeDialog === 'transfer' ? (
        <TransferAdmissionDialog
          open
          admission={selectedAdmission}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
      {selectedAdmission && activeDialog === 'discharge' ? (
        <DischargeAdmissionDialog
          open
          admission={selectedAdmission}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
      {selectedAdmission && activeDialog === 'cancel' ? (
        <CancelAdmissionDialog
          open
          admission={selectedAdmission}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
    </div>
  );
}
