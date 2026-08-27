'use client';

import { Checkbox } from '@hms/ui';

import type { PermissionMatrixRow } from '#lib/rbac/permission-matrix';

type RolePermissionsMatrixRowProps = {
  row: PermissionMatrixRow;
  selectedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
};

export function RolePermissionsMatrixRow({
  row,
  selectedKeys,
  onToggleKey,
}: RolePermissionsMatrixRowProps) {
  return (
    <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-2 border-t border-slate-100 px-4 py-2">
      <div>
        <p className="text-sm text-slate-800">{row.action}</p>
        {row.description ? <p className="text-xs text-slate-500">{row.description}</p> : null}
      </div>
      <div className="flex justify-center">
        {row.anyKey !== undefined ? (
          <Checkbox
            aria-label={row.anyKey}
            checked={selectedKeys.has(row.anyKey)}
            onCheckedChange={() => onToggleKey(row.anyKey as string)}
            className="border-slate-400"
          />
        ) : null}
      </div>
      <div className="flex justify-center">
        {row.ownKey !== undefined ? (
          <Checkbox
            aria-label={row.ownKey}
            checked={selectedKeys.has(row.ownKey)}
            onCheckedChange={() => onToggleKey(row.ownKey as string)}
            className="border-slate-400"
          />
        ) : null}
      </div>
    </div>
  );
}
