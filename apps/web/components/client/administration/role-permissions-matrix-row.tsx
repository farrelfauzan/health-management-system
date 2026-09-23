'use client';

import { Checkbox } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RolePermissionEffectBadges } from '#components/client/administration/role-permission-effect-badges';
import type { PermissionMatrixRow } from '#lib/rbac/permission-matrix';

type RolePermissionsMatrixRowProps = {
  row: PermissionMatrixRow;
  selectedKeys: ReadonlySet<string>;
  /** Ticked keys another ticked key needs, with the keys that need them (P22-T04). */
  lockedKeys: ReadonlyMap<string, string[]>;
  onToggleKey: (key: string) => void;
};

export function RolePermissionsMatrixRow({
  row,
  selectedKeys,
  lockedKeys,
  onToggleKey,
}: RolePermissionsMatrixRowProps) {
  const t = useTranslations('operations.administration.roles');
  const scopeKeys = [row.anyKey, row.ownKey];
  return (
    <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-2 border-t border-slate-100 px-4 py-2">
      <div>
        <p className="text-sm text-slate-800">{row.action}</p>
        {row.description ? <p className="text-xs text-slate-500">{row.description}</p> : null}
        <RolePermissionEffectBadges anyEffects={row.anyEffects} ownEffects={row.ownEffects} />
      </div>
      {scopeKeys.map((key, index) => {
        const requiredBy = key === undefined ? undefined : lockedKeys.get(key);
        return (
          <div key={index} className="flex justify-center">
            {key !== undefined ? (
              <Checkbox
                aria-label={key}
                aria-description={
                  requiredBy ? t('requiredBy', { keys: requiredBy.join(', ') }) : undefined
                }
                title={requiredBy ? t('requiredBy', { keys: requiredBy.join(', ') }) : undefined}
                checked={selectedKeys.has(key)}
                disabled={requiredBy !== undefined}
                onCheckedChange={() => onToggleKey(key)}
                className="border-slate-400"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
