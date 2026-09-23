'use client';

import type { PermissionCatalogEntry, RoleTemplate } from '@hms/shared-types';
import { describePermissionEffects } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { RolePermissionEffectBadges } from '#components/client/administration/role-permission-effect-badges';

type RoleGuideTemplateCardProps = {
  template: RoleTemplate;
  catalogByKey: ReadonlyMap<string, PermissionCatalogEntry>;
};

/**
 * One template in the role guide (P22-T05): what the job is, and each
 * permission it holds in the catalogue's own words, with the same labels the
 * permission matrix shows.
 */
export function RoleGuideTemplateCard({ template, catalogByKey }: RoleGuideTemplateCardProps) {
  const t = useTranslations('operations.administration.roles.templates');
  return (
    <section className="rounded-lg border border-slate-200">
      <header className="border-b border-slate-100 bg-slate-50 px-4 py-2">
        <h3 className="font-heading text-sm font-semibold text-slate-800">
          {t(`items.${template.code}.name`)}
        </h3>
        <p className="text-xs text-slate-600">{t(`items.${template.code}.description`)}</p>
      </header>
      <ul className="divide-y divide-slate-100">
        {template.permissionKeys.map((key) => (
          <li key={key} className="px-4 py-2">
            <p className="text-sm text-slate-800">{catalogByKey.get(key)?.description ?? key}</p>
            <p className="font-mono text-[11px] text-slate-400">{key}</p>
            <RolePermissionEffectBadges anyEffects={describePermissionEffects(key)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
