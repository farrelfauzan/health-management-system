'use client';

import type { PermissionEffects } from '@hms/shared-types';
import { Badge, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

type RolePermissionEffectBadgesProps = {
  anyEffects?: PermissionEffects;
  ownEffects?: PermissionEffects;
};

const BADGE_CLASS =
  'gap-1 rounded-full border-transparent font-heading text-[11px] font-medium tracking-wide';

/**
 * What a row's keys do beyond their own screen (P22-T04), next to the
 * checkboxes: MFA enrolment, the shell a portal key opens, and clinical record
 * content under D-033. Each was a real surprise to an administrator composing
 * a role on 2026-09-23.
 */
export function RolePermissionEffectBadges({
  anyEffects,
  ownEffects,
}: RolePermissionEffectBadgesProps) {
  const t = useTranslations('operations.administration.roles.effects');
  const effects = [anyEffects, ownEffects].filter((effect) => effect !== undefined);
  const portal = effects.find((effect) => effect.portal !== null)?.portal ?? null;
  const requiresMfa = effects.some((effect) => effect.requiresMfa);
  const isClinicalContent = effects.some((effect) => effect.isClinicalContent);
  if (!requiresMfa && portal === null && !isClinicalContent) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {portal !== null ? (
        <Badge className={cn(BADGE_CLASS, 'bg-info-tint text-info')}>
          <Icon name="login" size={12} />
          {t('portal', { shell: t(`shells.${portal}`) })}
        </Badge>
      ) : null}
      {requiresMfa ? (
        <Badge className={cn(BADGE_CLASS, 'bg-warning-tint text-warning')}>
          <Icon name="lock" size={12} />
          {t('mfa')}
        </Badge>
      ) : null}
      {isClinicalContent ? (
        <Badge className={cn(BADGE_CLASS, 'bg-danger-tint text-danger')}>
          <Icon name="clinical_notes" size={12} />
          {t('clinical')}
        </Badge>
      ) : null}
    </div>
  );
}
