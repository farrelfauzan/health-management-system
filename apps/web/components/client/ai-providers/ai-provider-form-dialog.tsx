'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AI_PROVIDER_KINDS,
  type AiProviderConfigView,
  type AiProviderKindValue,
} from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  aiProviderControllerCreateConfigV1,
  aiProviderControllerUpdateConfigV1,
} from '#lib/api/generated/ai-chatbot/ai-chatbot';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { AI_PROVIDER_MODEL_PLACEHOLDERS } from '#lib/ai-providers/ai-provider-model-placeholders';
import { invalidateAiProviderQueries } from '#lib/ai-providers/invalidate-ai-provider-queries';

type AiProviderFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AiProviderConfigView | null;
  onSaved: (message: string) => void;
};

export function AiProviderFormDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: AiProviderFormDialogProps) {
  const t = useTranslations('aiProviders.form');
  const queryClient = useQueryClient();
  const [providerKind, setProviderKind] = useState<AiProviderKindValue>(
    config?.providerKind ?? 'DEEPSEEK',
  );
  const [displayName, setDisplayName] = useState(config?.displayName ?? '');
  const [defaultModel, setDefaultModel] = useState(config?.defaultModel ?? '');
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedBaseUrl = baseUrl.trim();
      const trimmedApiKey = apiKey.trim();
      if (config) {
        return aiProviderControllerUpdateConfigV1(config.id, {
          displayName: displayName.trim(),
          defaultModel: defaultModel.trim(),
          baseUrl: trimmedBaseUrl === '' ? null : trimmedBaseUrl,
          // An omitted key keeps the stored one: the field is left blank
          // unless the admin is deliberately rotating it.
          ...(trimmedApiKey === '' ? {} : { apiKey: trimmedApiKey }),
        });
      }
      return aiProviderControllerCreateConfigV1({
        providerKind,
        displayName: displayName.trim(),
        defaultModel: defaultModel.trim(),
        ...(trimmedBaseUrl === '' ? {} : { baseUrl: trimmedBaseUrl }),
        ...(trimmedApiKey === '' ? {} : { apiKey: trimmedApiKey }),
      });
    },
    onSuccess: async () => {
      await invalidateAiProviderQueries(queryClient);
      onSaved(config ? t('updated') : t('created'));
      onOpenChange(false);
    },
    onError: (mutationError: unknown) => {
      setError(resolveApiErrorMessage(mutationError, t('saveFailed')));
    },
  });

  function handleSubmit(): void {
    setError(null);
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{config ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-provider-kind">{t('providerKind')}</Label>
            <Select
              value={providerKind}
              onValueChange={(value) => setProviderKind(value as AiProviderKindValue)}
              disabled={config !== null}
            >
              <SelectTrigger id="ai-provider-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDER_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config ? <p className="text-xs text-slate-500">{t('providerKindLocked')}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-provider-display-name">{t('displayName')}</Label>
            <Input
              id="ai-provider-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-provider-model">{t('defaultModel')}</Label>
            <Input
              id="ai-provider-model"
              value={defaultModel}
              placeholder={AI_PROVIDER_MODEL_PLACEHOLDERS[providerKind]}
              onChange={(event) => setDefaultModel(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-provider-base-url">{t('baseUrl')}</Label>
            <Input
              id="ai-provider-base-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <p className="text-xs text-slate-500">{t('baseUrlHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-provider-api-key">{t('apiKey')}</Label>
            <Input
              id="ai-provider-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={config?.hasApiKey ? `••••${config.apiKeyHint}` : ''}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-slate-500">
              {config ? t('apiKeyRotateHint') : t('apiKeyHint')}
            </p>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
