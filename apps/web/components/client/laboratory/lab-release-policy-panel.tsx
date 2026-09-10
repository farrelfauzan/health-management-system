'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LaboratorySettingsView, UpdateLaboratorySettingsInput } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  toast,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabReleasePolicyToggle } from '#components/client/laboratory/lab-release-policy-toggle';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { laboratorySettingsControllerUpdateLaboratorySettingsV1 } from '#lib/api/generated/laboratory-settings/laboratory-settings';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { getLaboratorySettingsControllerGetLaboratorySettingsV1QueryKey } from '#lib/api/generated/laboratory-settings/laboratory-settings';
import { useLaboratorySettings } from '#lib/laboratory/use-laboratory-settings';

/**
 * How this clinic runs its bench (`P18-T04`), which until now could only be
 * changed by calling the API by hand.
 *
 * Both settings loosen a rule rather than tighten one, so each says what the
 * clinic will do once it is on, and single-operator carries the consequence
 * out loud: it removes the second pair of eyes from every released result.
 * Visibility only — `PermissionsGuard` refuses the PATCH regardless.
 */
export function LabReleasePolicyPanel() {
  const t = useTranslations('operations.laboratory.releasePolicy');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'LaboratorySettings');
  const { settings, isPending, isError } = useLaboratorySettings();
  const [technicianMayVerify, setTechnicianMayVerify] = useState<boolean>(false);
  const [singleOperator, setSingleOperator] = useState<boolean>(false);

  // The server's answer is the starting position; a later refetch must not
  // wipe an edit in progress, so this syncs on identity of the loaded record.
  useEffect(() => {
    if (settings) {
      setTechnicianMayVerify(settings.technicianMayVerify);
      setSingleOperator(settings.singleOperator);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateLaboratorySettingsInput) =>
      laboratorySettingsControllerUpdateLaboratorySettingsV1(payload),
  });

  const isDirty =
    settings !== undefined &&
    (settings.technicianMayVerify !== technicianMayVerify ||
      settings.singleOperator !== singleOperator);

  async function handleSave(): Promise<void> {
    try {
      const response = await saveMutation.mutateAsync({ technicianMayVerify, singleOperator });
      parseApiSuccess<LaboratorySettingsView>(response, t('saveError'));
      await queryClient.invalidateQueries({
        queryKey: getLaboratorySettingsControllerGetLaboratorySettingsV1QueryKey(),
      });
      toast.success(t('saved'));
    } catch (caughtError) {
      notifyApiError(caughtError, t('saveError'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <InlineNotice tone="error">{t('loadError')}</InlineNotice>
        ) : (
          <>
            <LabReleasePolicyToggle
              label={t('technicianMayVerify.label')}
              description={
                technicianMayVerify ? t('technicianMayVerify.on') : t('technicianMayVerify.off')
              }
              checked={technicianMayVerify}
              disabled={!canWrite || saveMutation.isPending}
              onCheckedChange={setTechnicianMayVerify}
            />
            <LabReleasePolicyToggle
              label={t('singleOperator.label')}
              description={singleOperator ? t('singleOperator.on') : t('singleOperator.off')}
              checked={singleOperator}
              disabled={!canWrite || saveMutation.isPending}
              onCheckedChange={setSingleOperator}
              warning={singleOperator ? t('singleOperatorWarning') : undefined}
            />
            {canWrite ? (
              <Button
                type="button"
                className="bg-primary-container hover:bg-primary"
                disabled={!isDirty || saveMutation.isPending}
                onClick={() => void handleSave()}
              >
                {t('save')}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
