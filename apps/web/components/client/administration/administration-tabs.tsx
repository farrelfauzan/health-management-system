'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminUsersPanel } from '#components/client/administration/admin-users-panel';
import { RolesPanel } from '#components/client/administration/roles-panel';
import type { AdminUsersSearchParams } from '#lib/admin-users/search-params';

type AdministrationTabsProps = {
  initialQuery: AdminUsersSearchParams;
  defaultTab: 'users' | 'roles';
};

export function AdministrationTabs({ initialQuery, defaultTab }: AdministrationTabsProps) {
  const t = useTranslations('operations.administration');
  const ability = useAbility();
  const canReadRoles = ability.can('read', 'Role');

  if (!canReadRoles) {
    return <AdminUsersPanel initialQuery={initialQuery} />;
  }

  return (
    <Tabs defaultValue={defaultTab} className="space-y-5">
      <TabsList>
        <TabsTrigger value="users">{t('usersTab')}</TabsTrigger>
        <TabsTrigger value="roles">{t('rolesTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <AdminUsersPanel initialQuery={initialQuery} />
      </TabsContent>
      <TabsContent value="roles">
        <RolesPanel />
      </TabsContent>
    </Tabs>
  );
}
