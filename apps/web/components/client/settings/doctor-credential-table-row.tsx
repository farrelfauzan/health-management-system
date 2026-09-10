'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DoctorCredentialOption } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { doctorCredentialOptionControllerUpdateDoctorCredentialOptionV1 } from '#lib/api/generated/doctor-credential-options/doctor-credential-options';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDoctorCredentialOptions } from '#lib/doctors/invalidate-doctor-credential-options';

type DoctorCredentialTableRowProps = {
  option: DoctorCredentialOption;
  canManage: boolean;
};

/**
 * One catalog entry. The only destructive-looking action is a toggle, never a
 * delete: doctors already store the code, so removing the row would turn their
 * printed credential into an unresolvable string.
 */
export function DoctorCredentialTableRow({ option, canManage }: DoctorCredentialTableRowProps) {
  const t = useTranslations('operations.doctorCredentials');
  const queryClient = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      doctorCredentialOptionControllerUpdateDoctorCredentialOptionV1(option.id, { isActive }),
  });

  async function handleToggle(): Promise<void> {
    try {
      const response = await toggleMutation.mutateAsync(!option.isActive);
      parseApiSuccess<DoctorCredentialOption>(response, t('saveError'));
      await invalidateDoctorCredentialOptions(queryClient);
      toast.success(t('saved'));
    } catch (caughtError) {
      notifyApiError(caughtError, t('saveError'));
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{option.label}</TableCell>
      <TableCell className="font-mono text-xs text-slate-500">{option.code}</TableCell>
      <TableCell>{option.sortOrder}</TableCell>
      <TableCell>
        <Badge variant={option.isActive ? 'default' : 'outline'}>
          {t(option.isActive ? 'active' : 'inactive')}
        </Badge>
      </TableCell>
      {canManage ? (
        <TableCell>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={toggleMutation.isPending}
            onClick={() => void handleToggle()}
          >
            {t(option.isActive ? 'deactivate' : 'reactivate')}
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
