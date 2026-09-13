'use client';

import { Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useSatusehatEnvironment } from '#lib/integrations/use-satusehat-environment';

/**
 * Which SATUSEHAT platform is live (P21-T06).
 *
 * Above the tabs, like the other silent-fault cards, because this one changes
 * the meaning of everything below it: a green SUBMITTED row against the shared
 * staging sandbox proves the integration works and proves nothing to the
 * patient, whose SATUSEHAT Mobile reads production only. Without this an
 * operator cannot tell the two apart from any screen in the product.
 *
 * The sandbox is the state that needs saying, so it gets a warning tone.
 * Production is stated plainly rather than celebrated — it is the expected
 * steady state, and an alarming badge on it would train people to ignore the
 * one that matters. `UNKNOWN` is a warning too: an unrecognised host may be a
 * proxy in front of either platform, and the honest message is that we cannot
 * tell.
 */
export function SatusehatEnvironmentCard() {
  const t = useTranslations('operations.integrations.satusehatEnvironment');
  const { environment, isLoading } = useSatusehatEnvironment();

  if (isLoading || !environment) {
    return null;
  }

  const isProduction = environment.environment === 'PRODUCTION';
  const toneClassName = isProduction
    ? 'border-emerald-200 bg-emerald-50/60'
    : 'border-amber-200 bg-amber-50/60';
  const iconName = isProduction ? 'verified' : 'warning';
  const iconClassName = isProduction ? 'text-emerald-700' : 'text-amber-700';

  return (
    <Card className={`rounded-xl shadow-none ${toneClassName}`}>
      <CardContent className="flex items-start gap-3 py-4">
        <Icon name={iconName} size={20} className={`mt-0.5 shrink-0 ${iconClassName}`} />
        <div className="space-y-1">
          <p className="font-heading text-sm font-medium text-slate-800">
            {t(`label.${environment.environment}`)}
          </p>
          <p className="text-sm text-slate-600">
            {environment.isConfigured
              ? t(`description.${environment.environment}`)
              : t('notConfigured')}
          </p>
          <p className="font-mono text-xs text-slate-500">{environment.fhirHost}</p>
        </div>
      </CardContent>
    </Card>
  );
}
