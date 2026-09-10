'use client';

import { useRef } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  isDestructive?: boolean;
  isPending?: boolean;
};

/**
 * One decision, asked properly.
 *
 * This replaces `window.confirm`, which is not a small cosmetic difference.
 * The browser dialog is unstyled and unlocalised in its own buttons, it says
 * the page's origin rather than the product's name above copy the reader is
 * meant to trust, it blocks the whole tab while it is up, and Chrome will
 * suppress it outright after a few in a row — so a delete could silently go
 * unconfirmed. It also cannot show a pending state, which means a slow
 * mutation looks like nothing happened and invites a second click.
 *
 * Everything about focus and keyboard comes from the Radix dialog underneath:
 * Escape cancels, focus is trapped inside while it is open and returns to the
 * trigger when it closes. The one thing decided here is that focus lands on
 * **cancel**, never on the destructive button — an accidental Enter should do
 * the harmless thing.
 *
 * While `isPending` is set the dialog will not close by any route: not the
 * close button, not Escape, not a click outside. A half-finished delete that
 * loses its dialog leaves the reader with no idea whether it happened.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isDestructive = false,
  isPending = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(nextOpen: boolean): void {
    if (isPending && !nextOpen) {
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'destructive' : 'default'}
            disabled={isPending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
