'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminInvitationsPanel } from '#components/client/administration/admin-invitations-panel';
import { AdminUsersPanel } from '#components/client/administration/admin-users-panel';
import { RolesPanel } from '#components/client/administration/roles-panel';
import type { AdminUsersSearchParams } from '#lib/admin-users/search-params';

type AdministrationTabsProps = {
  initialQuery: AdminUsersSearchParams;
  defaultTab: 'users' | 'invitations' | 'roles';
};

export function AdministrationTabs({ initialQuery, defaultTab }: AdministrationTabsProps) {
  const t = useTranslations('operations.administration');
  const ability = useAbility();
  const canReadRoles = ability.can('read', 'Role');
  // Invitations are `User` reads, so anyone who can see the users list can see
  // them. The tab is still worth gating on the same check the panel's actions
  // use: a reader with no `update` permission gets a list with no buttons,
  // which is the correct read-only view rather than a broken one.
  const canReadUsers = ability.can('read', 'User');

  if (!canReadRoles) {
    return <AdminUsersPanel initialQuery={initialQuery} />;
  }

  return (
    <Tabs defaultValue={defaultTab} className="space-y-5">
      <TabsList>
        <TabsTrigger value="users">{t('usersTab')}</TabsTrigger>
        {canReadUsers ? (
          <TabsTrigger value="invitations">{t('invitations.tab')}</TabsTrigger>
        ) : null}
        <TabsTrigger value="roles">{t('rolesTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <AdminUsersPanel initialQuery={initialQuery} />
      </TabsContent>
      {canReadUsers ? (
        <TabsContent value="invitations">
          <AdminInvitationsPanel />
        </TabsContent>
      ) : null}
      <TabsContent value="roles">
        <RolesPanel />
      </TabsContent>
    </Tabs>
  );
}
