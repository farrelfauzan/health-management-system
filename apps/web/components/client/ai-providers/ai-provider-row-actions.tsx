'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiProviderConfigView, AiProviderConnectionTestResult } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  aiProviderControllerActivateConfigV1,
  aiProviderControllerDeleteConfigV1,
  aiProviderControllerTestConnectionV1,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAiProviderQueries } from '#lib/ai-providers/invalidate-ai-provider-queries';

type AiProviderRowActionsProps = {
  config: AiProviderConfigView;
  canWrite: boolean;
  onEdit: (config: AiProviderConfigView) => void;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function AiProviderRowActions({
  config,
  canWrite,
  onEdit,
  onResult,
  onError,
}: AiProviderRowActionsProps) {
  const t = useTranslations('aiProviders.actions');
  const queryClient = useQueryClient();
  const activateMutation = useMutation({
    mutationFn: () => aiProviderControllerActivateConfigV1(config.id),
    onSuccess: async () => {
      await invalidateAiProviderQueries(queryClient);
      onResult(t('activated'));
    },
    onError: (error: unknown) => onError(resolveApiErrorMessage(error, t('activateFailed'))),
  });
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await aiProviderControllerTestConnectionV1(config.id);
      return parseApiSuccess<AiProviderConnectionTestResult>(response, t('testFailed')).data;
    },
    onSuccess: async (result) => {
      await invalidateAiProviderQueries(queryClient);
      // A failed test is a successful request: the API reports the upstream
      // outcome so the reason can be shown instead of a generic error.
      if (result.isSuccessful) {
        onResult(result.message);
        return;
      }
      onError(result.message);
    },
    onError: (error: unknown) => onError(resolveApiErrorMessage(error, t('testFailed'))),
  });
  const deleteMutation = useMutation({
    mutationFn: () => aiProviderControllerDeleteConfigV1(config.id),
    onSuccess: async () => {
      await invalidateAiProviderQueries(queryClient);
      onResult(t('deleted'));
    },
    onError: (error: unknown) => onError(resolveApiErrorMessage(error, t('deleteFailed'))),
  });
  const isBusy =
    activateMutation.isPending || testMutation.isPending || deleteMutation.isPending;

  if (!canWrite) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(config)}>
        {t('edit')}
      </Button>
      {config.isActive ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? t('testing') : t('test')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => activateMutation.mutate()}
        >
          {t('activate')}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        // The active configuration cannot be deleted — the API refuses it, so
        // the button is disabled rather than offering a guaranteed failure.
        disabled={isBusy || config.isActive}
        onClick={() => deleteMutation.mutate()}
      >
        {t('delete')}
      </Button>
    </div>
  );
}
