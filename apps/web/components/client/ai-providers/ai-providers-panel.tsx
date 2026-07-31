'use client';

import { useState } from 'react';
import type { AiProviderConfigView } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AiProviderFormDialog } from '#components/client/ai-providers/ai-provider-form-dialog';
import { AiProvidersTable } from '#components/client/ai-providers/ai-providers-table';
import { PageHeader } from '#components/shared/page-header';
import { useAiProviderConfigs } from '#lib/ai-providers/use-ai-provider-configs';

type AiProvidersPanelProps = {
  canWrite: boolean;
};

export function AiProvidersPanel({ canWrite }: AiProvidersPanelProps) {
  const t = useTranslations('aiProviders');
  const configsQuery = useAiProviderConfigs();
  const [editingConfig, setEditingConfig] = useState<AiProviderConfigView | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configs = configsQuery.data ?? [];

  function openCreateDialog(): void {
    setEditingConfig(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(config: AiProviderConfigView): void {
    setEditingConfig(config);
    setIsDialogOpen(true);
  }

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
        breadcrumbs={[t('header.breadcrumbs.advanced'), t('header.breadcrumbs.aiProviders')]}
        actions={
          canWrite ? (
            <Button type="button" onClick={openCreateDialog}>
              {t('header.addProvider')}
            </Button>
          ) : null
        }
      />
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card>
        <CardContent className="p-0">
          {configsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : configsQuery.isError ? (
            <p className="p-6 text-sm text-red-600">{t('states.loadFailed')}</p>
          ) : configs.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('states.empty')}</p>
          ) : (
            <AiProvidersTable
              configs={configs}
              canWrite={canWrite}
              onEdit={openEditDialog}
              onResult={handleResult}
              onError={handleError}
            />
          )}
        </CardContent>
      </Card>
      {isDialogOpen ? (
        <AiProviderFormDialog
          // Remounting per target clears the form state between a create and
          // an edit without a reset effect.
          key={editingConfig?.id ?? 'create'}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          config={editingConfig}
          onSaved={handleResult}
        />
      ) : null}
    </div>
  );
}
