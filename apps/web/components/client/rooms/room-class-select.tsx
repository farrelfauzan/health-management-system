'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MissingParentNotice } from '#components/client/rooms/missing-parent-notice';
import { FormLabel } from '#components/client/shared/form-label';
import { ROOM_OPTION_LIST_LIMIT } from '#lib/rooms/option-list-limit';
import { useRoomClassesList } from '#lib/rooms/use-room-classes-list';

type RoomClassSelectProps = {
  id: string;
  value: string;
  onChange: (roomClassId: string) => void;
  isDisabled?: boolean;
  /** Marks the label when the consuming form cannot submit without a class. */
  isRequired?: boolean;
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
export function RoomClassSelect({
  id,
  value,
  onChange,
  isDisabled,
  isRequired = false,
}: RoomClassSelectProps) {
  const t = useTranslations('operations.rooms');
  const roomClassesQuery = useRoomClassesList({
    page: 1,
    limit: ROOM_OPTION_LIST_LIMIT,
    isActive: 'true',
  });

  return (
    <div className="space-y-2">
      <FormLabel htmlFor={id} required={isRequired}>
        {t('roomClass')}
      </FormLabel>
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
      {roomClassesQuery.isSuccess && roomClassesQuery.roomClasses.length === 0 ? (
        <MissingParentNotice message={t('noRoomClasses')} />
      ) : null}
    </div>
  );
}
