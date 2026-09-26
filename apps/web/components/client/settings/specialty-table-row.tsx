'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Specialty } from '@hms/shared-types';
import { Badge, Button, TableCell, TableRow, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { specialtyControllerUpdateSpecialtyV1 } from '#lib/api/generated/specialty/specialty';
import { notifyStatement } from '#lib/api/notify-statement';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateSpecialties } from '#lib/specialties/invalidate-specialties';
import { resolveSpecialtyErrorMessage } from '#lib/specialties/resolve-specialty-error-message';
import { useSpecialtyErrorMessages } from '#lib/specialties/use-specialty-error-messages';

type SpecialtyTableRowProps = {
  specialty: Specialty;
  canManage: boolean;
  onEdit: (specialty: Specialty) => void;
};

/**
 * One poli. The destructive-looking action is a toggle, never a delete: every
 * visit and invoice that named the poli keeps pointing at it.
 */
export function SpecialtyTableRow({ specialty, canManage, onEdit }: SpecialtyTableRowProps) {
  const t = useTranslations('operations.specialties');
  const errorMessages = useSpecialtyErrorMessages();
  const queryClient = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      specialtyControllerUpdateSpecialtyV1(specialty.id, { isActive }),
  });

  async function handleToggle(): Promise<void> {
    try {
      const response = await toggleMutation.mutateAsync(!specialty.isActive);
      parseApiSuccess<Specialty>(response, t('saveError'));
      await invalidateSpecialties(queryClient);
      toast.success(t('saved'));
    } catch (caughtError) {
      notifyStatement({
        tone: 'error',
        title: resolveSpecialtyErrorMessage(caughtError, errorMessages),
      });
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{specialty.name}</TableCell>
      <TableCell className="text-sm text-slate-500">{specialty.description ?? '—'}</TableCell>
      <TableCell>
        <Badge variant={specialty.isActive ? 'default' : 'outline'}>
          {t(specialty.isActive ? 'active' : 'inactive')}
        </Badge>
      </TableCell>
      {canManage ? (
        <TableCell>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(specialty)}>
              {t('rename')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={toggleMutation.isPending}
              onClick={() => void handleToggle()}
            >
              {t(specialty.isActive ? 'deactivate' : 'reactivate')}
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
