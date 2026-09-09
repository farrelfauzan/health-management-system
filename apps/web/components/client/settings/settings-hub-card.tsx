'use client';

import { Badge, Button, Card, CardContent, Icon, cn } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { SettingsHubCardKey } from '#lib/settings/settings-hub-cards';

type SettingsHubCardProps = {
  cardKey: SettingsHubCardKey;
  href: string;
  icon: string;
  /** A sentence saying what is unconfigured, when something is (SJ-156). */
  attention?: string | null;
};

/**
 * One configuration area on the hub (SJ-156): what it decides, in one line,
 * and the link to where it lives. The attention state is the reason the hub
 * exists — a clinic with no profile learns it here, before a render fails
 * for it somewhere nobody would think to look.
 */
export function SettingsHubCard({ cardKey, href, icon, attention = null }: SettingsHubCardProps) {
  const t = useTranslations('operations.settings');
  const hasAttention = attention !== null;

  return (
    <Card
      className={cn(
        'flex h-full flex-col rounded-xl py-0 shadow-none',
        hasAttention ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200',
      )}
      data-testid={`settings-card-${cardKey}`}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'flex size-10 items-center justify-center rounded-lg',
              hasAttention ? 'bg-amber-100 text-amber-800' : 'bg-info-tint text-primary',
            )}
          >
            <Icon name={icon} size={22} />
          </span>
          {hasAttention ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-100 text-amber-900"
              data-testid="settings-card-attention"
            >
              {t('needsAttention')}
            </Badge>
          ) : null}
        </div>
        <div className="flex-1 space-y-1">
          <h2 className="font-heading text-base font-semibold text-slate-900">
            {t(`cards.${cardKey}.title`)}
          </h2>
          <p className="text-sm text-slate-600">{t(`cards.${cardKey}.description`)}</p>
          {hasAttention ? <p className="text-sm text-amber-800">{attention}</p> : null}
        </div>
        <Button
          asChild
          variant={hasAttention ? 'default' : 'outline'}
          size="sm"
          className="self-start"
        >
          <Link href={href}>
            {t('open')}
            <Icon name="arrow_forward" size={16} />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
