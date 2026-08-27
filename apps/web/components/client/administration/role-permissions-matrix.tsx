'use client';

import { useTranslations } from 'next-intl';

import { RolePermissionsMatrixGroup } from '#components/client/administration/role-permissions-matrix-group';
import type { PermissionMatrixGroup } from '#lib/rbac/permission-matrix';

type RolePermissionsMatrixProps = {
  groups: PermissionMatrixGroup[];
  isFiltered: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
  onToggleGroup: (group: PermissionMatrixGroup) => void;
};

export function RolePermissionsMatrix({
  groups,
  isFiltered,
  selectedKeys,
  onToggleKey,
  onToggleGroup,
}: RolePermissionsMatrixProps) {
  const t = useTranslations('operations.administration.roles');

  if (groups.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-slate-500">
        {isFiltered ? t('permissionsSearchEmpty') : t('catalogEmpty')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <RolePermissionsMatrixGroup
          key={group.resource}
          group={group}
          selectedKeys={selectedKeys}
          onToggleKey={onToggleKey}
          onToggleGroup={onToggleGroup}
        />
      ))}
    </div>
  );
}
