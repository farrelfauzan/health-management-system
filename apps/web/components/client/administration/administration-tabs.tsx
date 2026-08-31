'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AdminInvitationsPanel } from '#components/client/administration/admin-invitations-panel';
import { AdminUsersPanel } from '#components/client/administration/admin-users-panel';
import { RolesPanel } from '#components/client/administration/roles-panel';
import { ClinicProfilePanel } from '#components/client/clinic-profile/clinic-profile-panel';
import type { AdminUsersSearchParams } from '#lib/admin-users/search-params';

type AdministrationTabsProps = {
  initialQuery: AdminUsersSearchParams;
  defaultTab: 'users' | 'invitations' | 'roles' | 'clinic';
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
  // P16-T02. Read is granted to every role that prints something, so this tab
  // can be visible to somebody who cannot edit it — the panel renders a
  // disabled form in that case rather than hiding the clinic's own details
  // from the people who put them on a document.
  const canReadClinicProfile = ability.can('read', 'ClinicProfile');

  if (!canReadRoles && !canReadClinicProfile) {
    return <AdminUsersPanel initialQuery={initialQuery} />;
  }

  return (
    <Tabs defaultValue={defaultTab} className="space-y-5">
      <TabsList>
        <TabsTrigger value="users">{t('usersTab')}</TabsTrigger>
        {canReadUsers ? (
          <TabsTrigger value="invitations">{t('invitations.tab')}</TabsTrigger>
        ) : null}
        {canReadRoles ? <TabsTrigger value="roles">{t('rolesTab')}</TabsTrigger> : null}
        {canReadClinicProfile ? (
          <TabsTrigger value="clinic">{t('clinicProfile.tab')}</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="users">
        <AdminUsersPanel initialQuery={initialQuery} />
      </TabsContent>
      {canReadUsers ? (
        <TabsContent value="invitations">
          <AdminInvitationsPanel />
        </TabsContent>
      ) : null}
      {canReadRoles ? (
        <TabsContent value="roles">
          <RolesPanel />
        </TabsContent>
      ) : null}
      {canReadClinicProfile ? (
        <TabsContent value="clinic">
          <ClinicProfilePanel />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
