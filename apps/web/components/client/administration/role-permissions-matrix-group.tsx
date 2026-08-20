'use client';

import { useTranslations } from 'next-intl';

import { RolePermissionsMatrixRow } from '#components/client/administration/role-permissions-matrix-row';
import { countSelectedInGroup, type PermissionMatrixGroup } from '#lib/rbac/permission-matrix';

type RolePermissionsMatrixGroupProps = {
  group: PermissionMatrixGroup;
  selectedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
};

export function RolePermissionsMatrixGroup({
  group,
  selectedKeys,
  onToggleKey,
}: RolePermissionsMatrixGroupProps) {
  const t = useTranslations('operations.administration.roles');
  const selectedCount = countSelectedInGroup(group, selectedKeys);

  return (
    <section className="rounded-lg border border-slate-200">
      <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
        <h3 className="font-heading text-sm font-semibold text-slate-800">{group.resource}</h3>
        <span className="text-xs text-slate-500">
          {t('groupSelected', { count: selectedCount })}
        </span>
      </header>
      <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-2 px-4 py-1 text-xs font-medium text-slate-500">
        <span />
        <span className="text-center">{t('scopeAny')}</span>
        <span className="text-center">{t('scopeOwn')}</span>
      </div>
      <div>
        {group.rows.map((row) => (
          <RolePermissionsMatrixRow
            key={row.action}
            row={row}
            selectedKeys={selectedKeys}
            onToggleKey={onToggleKey}
          />
        ))}
      </div>
    </section>
  );
}
