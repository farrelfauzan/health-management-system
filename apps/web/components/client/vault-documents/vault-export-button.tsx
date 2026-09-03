'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { exportVault } from '#lib/vault-documents/export-vault';

type VaultExportButtonProps = {
  isDisabled: boolean;
  onError: (message: string) => void;
};

/**
 * Takes the whole vault away in one file (FR-E3-12).
 *
 * Leaving a clinic should not mean leaving your own paperwork behind, and the
 * archive carries the reference numbers and dates alongside the files — a bag
 * of unnamed PDFs would be a worse copy than the one being replaced.
 *
 * Disabled on an empty vault rather than hidden: an owner who has just
 * deleted everything should still see that the option exists.
 */
export function VaultExportButton({ isDisabled, onError }: VaultExportButtonProps) {
  const t = useTranslations('vault.export');

  const exportMutation = useMutation({
    mutationFn: exportVault,
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isDisabled || exportMutation.isPending}
      onClick={() => exportMutation.mutate()}
    >
      <Icon name="archive" size={18} />
      {exportMutation.isPending ? t('pending') : t('label')}
    </Button>
  );
}
