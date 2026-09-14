'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RegisterSatusehatLocationsInput,
  SatusehatLocationNode,
  SatusehatLocationRegistrationResultView,
} from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SatusehatLocationOutcomeList } from '#components/client/integrations/satusehat-location-outcome-list';
import { SatusehatLocationRow } from '#components/client/integrations/satusehat-location-row';
import { InlineNotice } from '#components/client/shared/inline-notice';
import {
  getSatusehatLocationControllerListLocationsV1QueryKey,
  satusehatLocationControllerRegisterLocationsV1,
} from '#lib/api/generated/satusehat/satusehat';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useSatusehatLocations } from '#lib/integrations/use-satusehat-locations';

/**
 * "Lokasi SATUSEHAT" (P24-T06, US-LOC-01): the clinic site, its polis and the
 * ward → room → bed tree with each row's status, "Daftarkan" per row and
 * "Daftarkan semua". Registration runs on the API in tree order, so the panel
 * only sends targets and shows what came back.
 */
export function SatusehatLocationsPanel() {
  const t = useTranslations('operations.integrations.satusehatLocations');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'SatusehatLocation');
  const locationsQuery = useSatusehatLocations();
  const [result, setResult] = useState<SatusehatLocationRegistrationResultView | null>(null);
  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterSatusehatLocationsInput) => {
      const response = await satusehatLocationControllerRegisterLocationsV1(payload);
      return parseApiSuccess<SatusehatLocationRegistrationResultView>(response, t('registerError'))
        .data;
    },
    onSuccess: async (registration) => {
      setResult(registration);
      await queryClient.invalidateQueries({
        queryKey: getSatusehatLocationControllerListLocationsV1QueryKey(),
      });
    },
    onError: (error) => notifyApiError(error, t('registerError')),
  });
  const hasUnregistered = locationsQuery.nodes.some((node) => node.status === 'UNREGISTERED');
  const isEmpty = !locationsQuery.isLoading && !locationsQuery.isError && locationsQuery.nodes.length === 0;

  function handleRegisterNode(node: SatusehatLocationNode): void {
    registerMutation.mutate({ targets: [{ kind: node.kind, id: node.id }] });
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="font-heading text-base">{t('title')}</CardTitle>
          <p className="text-sm text-slate-600">{t('description')}</p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            disabled={registerMutation.isPending || !hasUnregistered}
            onClick={() => registerMutation.mutate({ all: true })}
          >
            {registerMutation.isPending ? t('registering') : t('registerAll')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? <SatusehatLocationOutcomeList result={result} /> : null}
        {locationsQuery.isError ? <InlineNotice tone="error">{t('loadError')}</InlineNotice> : null}
        {locationsQuery.isLoading ? <p className="text-sm text-slate-500">{t('loading')}</p> : null}
        {isEmpty ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('empty')}
          </p>
        ) : null}
        {locationsQuery.nodes.length > 0 ? (
          <ul>
            {locationsQuery.nodes.map((node) => (
              <SatusehatLocationRow
                key={`${node.kind}:${node.id}`}
                node={node}
                canWrite={canWrite}
                isPending={registerMutation.isPending}
                onRegister={handleRegisterNode}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
