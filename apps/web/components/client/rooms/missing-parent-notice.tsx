'use client';

import { Button } from '@hms/ui';

type MissingParentNoticeProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * What a form shows in place of a parent picker when there is nothing to
 * pick: no ward for a room, no room for a bed, no class for either. One
 * component so the three forms say it the same way, with an optional button
 * that takes the user to where the missing parent gets created.
 */
export function MissingParentNotice({ message, actionLabel, onAction }: MissingParentNoticeProps) {
  return (
    <div className="space-y-2" role="status">
      <p className="text-sm text-warning">{message}</p>
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
