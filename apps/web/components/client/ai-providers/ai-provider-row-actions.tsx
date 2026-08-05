'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiProviderConfigView, AiProviderConnectionTestResult } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
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

  // Icon-only, so every button keeps its wording as its accessible name and
  // its tooltip: the glyph is the affordance, the label is still what a
  // screen reader announces and what a hover confirms before a click that
  // switches which provider answers the clinic's questions.
  return (
    <div className="flex justify-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onEdit(config)}
        aria-label={t('edit')}
        title={t('edit')}
      >
        <Icon name="edit" size={18} className="text-slate-500" />
      </Button>
      {config.isActive ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isBusy}
          onClick={() => testMutation.mutate()}
          aria-label={testMutation.isPending ? t('testing') : t('test')}
          title={testMutation.isPending ? t('testing') : t('test')}
        >
          <Icon
            name={testMutation.isPending ? 'progress_activity' : 'network_check'}
            size={18}
            className={testMutation.isPending ? 'animate-spin text-slate-400' : 'text-slate-500'}
          />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isBusy}
          onClick={() => activateMutation.mutate()}
          aria-label={t('activate')}
          title={t('activate')}
        >
          <Icon name="check_circle" size={18} className="text-slate-500" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        // The active configuration cannot be deleted — the API refuses it, so
        // the button is disabled rather than offering a guaranteed failure.
        disabled={isBusy || config.isActive}
        onClick={() => deleteMutation.mutate()}
        aria-label={t('delete')}
        title={t('delete')}
      >
        <Icon name="delete" size={18} className="text-slate-400 hover:text-destructive" />
      </Button>
    </div>
  );
}
