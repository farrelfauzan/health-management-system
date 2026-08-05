'use client';

import type { AiProviderConfigView } from '@hms/shared-types';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AiProviderRowActions } from '#components/client/ai-providers/ai-provider-row-actions';

type AiProvidersTableProps = {
  configs: AiProviderConfigView[];
  canWrite: boolean;
  onEdit: (config: AiProviderConfigView) => void;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function AiProvidersTable({
  configs,
  canWrite,
  onEdit,
  onResult,
  onError,
}: AiProvidersTableProps) {
  const t = useTranslations('aiProviders.table');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('displayName')}</TableHead>
          <TableHead>{t('providerKind')}</TableHead>
          <TableHead>{t('model')}</TableHead>
          <TableHead>{t('apiKey')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('lastTest')}</TableHead>
          {/* Start-aligned like every other header in this table: with the
              actions rendered as compact icons, a right-aligned title sat far
              from the buttons it names. */}
          <TableHead className="text-start">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {configs.map((config) => (
          <TableRow key={config.id}>
            <TableCell className="font-medium">{config.displayName}</TableCell>
            <TableCell>{config.providerKind}</TableCell>
            <TableCell className="font-mono text-xs">{config.defaultModel}</TableCell>
            <TableCell className="font-mono text-xs">
              {/* Never the key itself — the API only ever returns the hint. */}
              {config.hasApiKey ? `••••${config.apiKeyHint}` : t('noApiKey')}
            </TableCell>
            <TableCell>
              {config.isActive ? (
                <Badge>{t('active')}</Badge>
              ) : (
                <Badge variant="outline">{t('staged')}</Badge>
              )}
            </TableCell>
            <TableCell className="max-w-xs truncate text-xs text-slate-500">
              {config.lastTestResult ?? t('neverTested')}
            </TableCell>
            <TableCell>
              <AiProviderRowActions
                config={config}
                canWrite={canWrite}
                onEdit={onEdit}
                onResult={onResult}
                onError={onError}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
