'use client';

import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { summarizeRolePermissionEffects } from '#lib/rbac/summarize-role-permission-effects';

type RolePermissionsWarningsProps = {
  selectedKeys: ReadonlySet<string>;
};

/**
 * The consequences of the whole selection, stated before saving (P22-T04):
 * no shell to sign in to, more than one shell with the admin one winning, a
 * second factor every member must enrol, and clinical record content. Each is
 * a role that, on 2026-09-23, did something its author did not expect.
 */
export function RolePermissionsWarnings({ selectedKeys }: RolePermissionsWarningsProps) {
  const t = useTranslations('operations.administration.roles.warnings');
  const tShells = useTranslations('operations.administration.roles.effects.shells');
  const summary = summarizeRolePermissionEffects(selectedKeys);
  return (
    <div className="space-y-2" data-testid="role-permissions-warnings">
      {summary.portals.length === 0 ? (
        <InlineNotice tone="error" title={t('noPortalTitle')}>
          {t('noPortal')}
        </InlineNotice>
      ) : null}
      {summary.portals.length > 1 ? (
        <InlineNotice tone="info">
          {t('multiplePortals', {
            shells: summary.portals.map((shell) => tShells(shell)).join(', '),
          })}
        </InlineNotice>
      ) : null}
      {summary.mfaKeys.length > 0 ? (
        <InlineNotice tone="warning" title={t('mfaTitle')}>
          {t('mfa', { keys: summary.mfaKeys.join(', ') })}
        </InlineNotice>
      ) : null}
      {summary.clinicalKeys.length > 0 ? (
        <InlineNotice tone="warning" title={t('clinicalTitle')}>
          {t('clinical', { keys: summary.clinicalKeys.join(', ') })}
        </InlineNotice>
      ) : null}
    </div>
  );
}
