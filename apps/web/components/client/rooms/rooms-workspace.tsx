'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BedsPanel } from '#components/client/rooms/beds-panel';
import { OccupancyPanel } from '#components/client/rooms/occupancy-panel';
import { RoomClassesPanel } from '#components/client/rooms/room-classes-panel';
import { RoomsPanel } from '#components/client/rooms/rooms-panel';
import { WardsPanel } from '#components/client/rooms/wards-panel';
import { PageHeader } from '#components/shared/page-header';

export function RoomsWorkspace() {
  const t = useTranslations('operations.rooms');
  const ability = useAbility();
  const canReadClasses = ability.can('read', 'RoomClass');
  const canReadWards = ability.can('read', 'Ward');
  const canReadRooms = ability.can('read', 'Room');
  const canReadBeds = ability.can('read', 'Bed');
  // The occupancy board is a bed aggregate, so it follows the bed grant. A
  // clinic that lets a clerk read wards but not beds still gets a usable
  // screen — one tab fewer, not a blank page.
  const defaultTab = canReadBeds ? 'occupancy' : canReadWards ? 'wards' : 'rooms';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList>
          {canReadBeds ? <TabsTrigger value="occupancy">{t('occupancy')}</TabsTrigger> : null}
          {canReadWards ? <TabsTrigger value="wards">{t('wards')}</TabsTrigger> : null}
          {canReadRooms ? <TabsTrigger value="rooms">{t('rooms')}</TabsTrigger> : null}
          {canReadBeds ? <TabsTrigger value="beds">{t('beds')}</TabsTrigger> : null}
          {canReadClasses ? <TabsTrigger value="classes">{t('classes')}</TabsTrigger> : null}
        </TabsList>
        {canReadBeds ? (
          <TabsContent value="occupancy">
            <OccupancyPanel />
          </TabsContent>
        ) : null}
        {canReadWards ? (
          <TabsContent value="wards">
            <WardsPanel />
          </TabsContent>
        ) : null}
        {canReadRooms ? (
          <TabsContent value="rooms">
            <RoomsPanel />
          </TabsContent>
        ) : null}
        {canReadBeds ? (
          <TabsContent value="beds">
            <BedsPanel />
          </TabsContent>
        ) : null}
        {canReadClasses ? (
          <TabsContent value="classes">
            <RoomClassesPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
