'use client';

import { useState } from 'react';
import type { DoctorCredentialKindValue } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Tabs,
  TabsList,
  TabsTrigger,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorCredentialOptionDialog } from '#components/client/settings/doctor-credential-option-dialog';
import { DoctorCredentialTable } from '#components/client/settings/doctor-credential-table';
import { useDoctorCredentialOptions } from '#lib/doctors/use-doctor-credential-options';

const CREDENTIAL_KINDS: readonly DoctorCredentialKindValue[] = [
  'TITLE',
  'DEGREE',
  'FIELD_OF_STUDY',
];

/**
 * The master data behind the doctor form's title, degrees and field-of-study
 * pickers (P19-T14). Deactivated options are shown rather than hidden, because
 * the only way to bring one back is to see that it is there.
 */
export function DoctorCredentialPanel() {
  const t = useTranslations('operations.doctorCredentials');
  const ability = useAbility();
  const canManage = ability.can('update', 'Doctor');
  const [kind, setKind] = useState<DoctorCredentialKindValue>('TITLE');
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const { options, isPending, isError } = useDoctorCredentialOptions({
    kind,
    includeInactive: true,
  });

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
              data-testid="doctor-credential-new"
              onClick={() => setIsDialogOpen(true)}
            >
              <Icon name="add" size={18} />
              {t('add')}
            </Button>
          ) : null}
        </div>
        <Tabs
          value={kind}
          onValueChange={(next) => setKind(next as DoctorCredentialKindValue)}
          className="pt-2"
        >
          <TabsList>
            {CREDENTIAL_KINDS.map((credentialKind) => (
              <TabsTrigger key={credentialKind} value={credentialKind}>
                {t(`kinds.${credentialKind}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        <DoctorCredentialTable
          options={options}
          isPending={isPending}
          isError={isError}
          canManage={canManage}
        />
        <p className="text-xs text-slate-500">{t('deactivateHint')}</p>
      </CardContent>
      {isDialogOpen ? (
        <DoctorCredentialOptionDialog
          open={isDialogOpen}
          kind={kind}
          onOpenChange={setIsDialogOpen}
        />
      ) : null}
    </Card>
  );
}
