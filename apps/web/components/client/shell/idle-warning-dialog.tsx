'use client';

import { useTranslations } from 'next-intl';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';

type IdleWarningDialogProps = {
  isOpen: boolean;
  secondsRemaining: number;
  onContinue: () => void;
  onEndNow: () => void;
};

/**
 * The "still there?" warning (SJ-9).
 *
 * Deliberately not dismissable by clicking away or pressing Escape. Those
 * gestures are how people close a dialog they have not read, and here the two
 * outcomes — stay signed in, or hand the workstation over — are exactly what
 * needs a deliberate answer. Doing nothing is also a valid choice: the
 * countdown runs out and the session ends, which is the safe default.
 */
export function IdleWarningDialog({
  isOpen,
  secondsRemaining,
  onContinue,
  onEndNow,
}: IdleWarningDialogProps) {
  const t = useTranslations('authShell.shell.idle');

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { seconds: Math.max(0, secondsRemaining) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onEndNow}>
            {t('endNow')}
          </Button>
          {/*
            Autofocused so a keypress — the most likely reaction to a modal
            appearing — resolves it the safe way rather than ending a session
            somebody is in the middle of using.
          */}
          <Button type="button" autoFocus onClick={onContinue}>
            {t('continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
