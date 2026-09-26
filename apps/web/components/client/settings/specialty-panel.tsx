'use client';

import { useState } from 'react';
import type { Specialty } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SpecialtyFormDialog } from '#components/client/settings/specialty-form-dialog';
import { SpecialtyTable } from '#components/client/settings/specialty-table';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

type SpecialtyDialogState = { isOpen: false } | { isOpen: true; specialty?: Specialty };

/**
 * The poli catalog screen: add, rename, deactivate and reactivate. Inactive
 * poli are listed with the active ones, because the only way to bring one
 * back is to see that it is there.
 */
export function SpecialtyPanel() {
  const t = useTranslations('operations.specialties');
  const ability = useAbility();
  const canManage = ability.can('manage', 'Specialty');
  const [dialog, setDialog] = useState<SpecialtyDialogState>({ isOpen: false });
  const { specialties, isPending, isError } = useSpecialtiesList();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {canManage ? (
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              data-testid="specialty-new"
              onClick={() => setDialog({ isOpen: true })}
            >
              <Icon name="add" size={18} />
              {t('add')}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <SpecialtyTable
          specialties={specialties}
          isPending={isPending}
          isError={isError}
          canManage={canManage}
          onEdit={(specialty) => setDialog({ isOpen: true, specialty })}
        />
        <p className="text-xs text-slate-500">{t('deactivateHint')}</p>
      </CardContent>
      {dialog.isOpen ? (
        <SpecialtyFormDialog
          open
          specialty={dialog.specialty}
          onOpenChange={(open) => (open ? undefined : setDialog({ isOpen: false }))}
        />
      ) : null}
    </Card>
  );
}
