'use client';

import { useState } from 'react';
import type { ClinicianProfessionValue, DoctorAuthority } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Table,
  TableBody,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorAuthorityFormDialog } from '#components/client/doctors/doctor-authority-form-dialog';
import { DoctorAuthorityRevokeDialog } from '#components/client/doctors/doctor-authority-revoke-dialog';
import { DoctorAuthorityRow } from '#components/client/doctors/doctor-authority-row';
import { useDoctorAuthorities } from '#lib/doctors/use-doctor-authorities';

type DoctorAuthoritiesCardProps = {
  doctorId: string;
  doctorName: string;
  profession: ClinicianProfessionValue;
};

/**
 * A midwife's delegated authorities — kewenangan (P25-T02). Renders only for
 * a MIDWIFE profile and only for a viewer who may `read DoctorAuthority`;
 * the query itself stays disabled otherwise, so a doctor's page never asks.
 * Visibility only — the API's permission guard is the boundary.
 */
export function DoctorAuthoritiesCard({
  doctorId,
  doctorName,
  profession,
}: DoctorAuthoritiesCardProps) {
  const ability = useAbility();
  const t = useTranslations('clinical');
  const isVisible = profession === 'MIDWIFE' && ability.can('read', 'DoctorAuthority');
  const canWrite = ability.can('write', 'DoctorAuthority');
  const authoritiesQuery = useDoctorAuthorities(doctorId, isVisible);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<DoctorAuthority | null>(null);
  const [revoking, setRevoking] = useState<DoctorAuthority | null>(null);

  if (!isVisible) {
    return null;
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none" data-testid="doctor-authorities-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="font-heading text-base">{t('doctors.authorities.title')}</CardTitle>
          <CardDescription>{t('doctors.authorities.description')}</CardDescription>
        </div>
        {canWrite ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsCreateOpen(true)}>
            <Icon name="add" size={16} />
            {t('doctors.authorities.add')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {authoritiesQuery.isError ? (
          <p className="text-sm text-danger">{t('doctors.authorities.loadError')}</p>
        ) : authoritiesQuery.authorities.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableBody>
                {authoritiesQuery.authorities.map((authority) => (
                  <DoctorAuthorityRow
                    key={authority.id}
                    authority={authority}
                    canWrite={canWrite}
                    onEdit={setEditing}
                    onRevoke={setRevoking}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : authoritiesQuery.isPending ? null : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('doctors.authorities.empty')}
          </p>
        )}
      </CardContent>
      {isCreateOpen ? (
        <DoctorAuthorityFormDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          doctorId={doctorId}
          doctorName={doctorName}
        />
      ) : null}
      {editing ? (
        <DoctorAuthorityFormDialog
          key={editing.id}
          open
          onOpenChange={(open) => (open ? undefined : setEditing(null))}
          doctorId={doctorId}
          doctorName={doctorName}
          authority={editing}
        />
      ) : null}
      {revoking ? (
        <DoctorAuthorityRevokeDialog
          key={revoking.id}
          open
          onOpenChange={(open) => (open ? undefined : setRevoking(null))}
          authority={revoking}
          doctorName={doctorName}
        />
      ) : null}
    </Card>
  );
}
