'use client';

import { useState } from 'react';
import type { ClinicianProfessionValue, DoctorMandate } from '@hms/shared-types';
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

import { DoctorMandateFormDialog } from '#components/client/doctors/doctor-mandate-form-dialog';
import { DoctorMandateRevokeDialog } from '#components/client/doctors/doctor-mandate-revoke-dialog';
import { DoctorMandateRow } from '#components/client/doctors/doctor-mandate-row';
import { useDoctorMandates } from '#lib/doctors/use-doctor-mandates';

type DoctorMandatesCardProps = {
  doctorId: string;
  doctorName: string;
  profession: ClinicianProfessionValue;
};

/**
 * The written pelimpahan a midwife works under (P25-T05). Sits next to the
 * authorities card and answers the other half of the question: what she may do
 * in her own right, and what she does under a doctor's responsibility.
 *
 * Renders only for a MIDWIFE profile and only for a viewer who may `read
 * DoctorMandate`; the query stays disabled otherwise, so a doctor's page never
 * asks. Visibility only — the API's permission guard is the boundary.
 */
export function DoctorMandatesCard({
  doctorId,
  doctorName,
  profession,
}: DoctorMandatesCardProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const isVisible = profession === 'MIDWIFE' && ability.can('read', 'DoctorMandate');
  const canWrite = ability.can('write', 'DoctorMandate');
  const mandatesQuery = useDoctorMandates(doctorId, isVisible);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [revoking, setRevoking] = useState<DoctorMandate | null>(null);

  if (!isVisible) {
    return null;
  }

  return (
    <Card
      className="@container/mandates rounded-xl border-slate-200 shadow-none"
      data-testid="doctor-mandates-card"
    >
      <CardHeader className="flex flex-col gap-3 @md/mandates:flex-row @md/mandates:items-start @md/mandates:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="font-heading text-base">{t('doctors.mandates.title')}</CardTitle>
          <CardDescription>{t('doctors.mandates.description')}</CardDescription>
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 self-start"
            onClick={() => setIsCreateOpen(true)}
          >
            <Icon name="add" size={16} />
            {t('doctors.mandates.add')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {mandatesQuery.isError ? (
          <p className="text-sm text-danger">{t('doctors.mandates.loadError')}</p>
        ) : mandatesQuery.mandates.length > 0 ? (
          <ul className="space-y-2">
            {mandatesQuery.mandates.map((mandate) => (
              <DoctorMandateRow
                key={mandate.id}
                mandate={mandate}
                canWrite={canWrite}
                onRevoke={setRevoking}
              />
            ))}
          </ul>
        ) : mandatesQuery.isPending ? null : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('doctors.mandates.empty')}
          </p>
        )}
      </CardContent>
      {isCreateOpen ? (
        <DoctorMandateFormDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          doctorId={doctorId}
          doctorName={doctorName}
        />
      ) : null}
      {revoking ? (
        <DoctorMandateRevokeDialog
          key={revoking.id}
          open
          onOpenChange={(open) => (open ? undefined : setRevoking(null))}
          mandate={revoking}
          doctorName={doctorName}
        />
      ) : null}
    </Card>
  );
}
