'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { TaxNpwpSummary } from '#components/client/taxes/tax-npwp-summary';
import { TaxSettingsForm } from '#components/client/taxes/tax-settings-form';
import { useTaxSettings } from '#lib/taxes/use-tax-settings';

/**
 * The clinic's tax profile (P27-T02). Loads once and hands the answer to the
 * form; the NPWP is shown above it because the clinic profile owns it and the
 * NITKU below must extend it. Visibility only — the API refuses regardless.
 */
export function TaxSettingsPanel() {
  const t = useTranslations('operations.taxes.settings');
  const ability = useAbility();
  const { settings, isPending, isError } = useTaxSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : isError || settings === undefined ? (
          <InlineNotice tone="error">{t('loadError')}</InlineNotice>
        ) : (
          <>
            <TaxNpwpSummary npwp={settings.npwp} npwpStatus={settings.npwpStatus} />
            <TaxSettingsForm settings={settings} canWrite={ability.can('write', 'TaxSettings')} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
