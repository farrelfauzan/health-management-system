'use client';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useRoomClassesList } from '#lib/rooms/use-room-classes-list';

const ROOM_CLASS_OPTIONS_LIMIT = 100;

type RoomClassSelectProps = {
  id: string;
  value: string;
  onChange: (roomClassId: string) => void;
  isDisabled?: boolean;
};

/**
 * The class picker, fed from the master-data table rather than a list this
 * file keeps. It is shared by the room form and the accommodation tariff form,
 * so a class the clinic added this morning appears in both without either one
 * being edited.
 *
 * Only active classes are offered: a retired class is refused by the API, and
 * offering it would be an option that always fails.
 */
export function RoomClassSelect({ id, value, onChange, isDisabled }: RoomClassSelectProps) {
  const t = useTranslations('operations.rooms');
  const roomClassesQuery = useRoomClassesList({
    page: 1,
    limit: ROOM_CLASS_OPTIONS_LIMIT,
    isActive: 'true',
  });

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('roomClass')}</Label>
      <Select value={value} onValueChange={onChange} disabled={isDisabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('roomClass')} />
        </SelectTrigger>
        <SelectContent>
          {roomClassesQuery.roomClasses.map((roomClass) => (
            <SelectItem key={roomClass.id} value={roomClass.id}>
              {roomClass.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!roomClassesQuery.isPending && roomClassesQuery.roomClasses.length === 0 ? (
        <p className="text-sm text-warning">{t('noRoomClasses')}</p>
      ) : null}
    </div>
  );
}
