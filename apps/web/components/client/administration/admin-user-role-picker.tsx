'use client';

import { useTranslations } from 'next-intl';

import type { AdminRoleOption } from '@hms/shared-types';
import { Checkbox, cn } from '@hms/ui';

type AdminUserRolePickerProps = {
  roles: AdminRoleOption[];
  selectedRoleCodes: string[];
  isLoading: boolean;
  hasError?: boolean;
  onToggleRole: (roleCode: string) => void;
};

export function AdminUserRolePicker({
  roles,
  selectedRoleCodes,
  isLoading,
  hasError = false,
  onToggleRole,
}: AdminUserRolePickerProps) {
  const t = useTranslations('operations.administration');
  if (isLoading) {
    return <p className="text-sm text-slate-500">{t('saving')}</p>;
  }

  if (roles.length === 0) {
    return <p className="text-sm text-slate-500">{t('noRoles')}</p>;
  }

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border border-slate-200 p-3',
        hasError && 'border-rose-300',
      )}
    >
      {roles.map((role) => (
        <label key={role.id} className="flex cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={selectedRoleCodes.includes(role.code)}
            onCheckedChange={() => onToggleRole(role.code)}
          />
          <span className="text-sm text-slate-700">{role.name}</span>
        </label>
      ))}
    </div>
  );
}
