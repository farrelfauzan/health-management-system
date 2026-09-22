'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

/**
 * How long the frame gets to load before the page is assumed to refuse
 * framing. A cross-origin `X-Frame-Options` refusal fires no error event the
 * parent can read, so time is the only signal there is.
 */
const FRAME_LOAD_TIMEOUT_MS = 8_000;

type PatientKycDialogProps = {
  /** The validation URL, or null when no session is open. Never cached. */
  url: string | null;
  onClose: () => void;
};

/**
 * The SATUSEHAT validation page in a dialog (FR-KYC-02). Radix's dialog traps
 * focus, closes on Escape and returns focus to the trigger; what is added
 * here is the new-tab fallback for when the platform refuses framing — the
 * link is always offered, and the notice appears when the frame has not
 * loaded in time. The URL is not written anywhere: it exists in the parent's
 * state while the dialog is open and is dropped on close.
 */
export function PatientKycDialog({ url, onClose }: PatientKycDialogProps) {
  const t = useTranslations('clinical.patients.kyc.dialog');
  const [isFrameBlocked, setIsFrameBlocked] = useState<boolean>(false);
  const [hasFrameLoaded, setHasFrameLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (url === null) {
      setIsFrameBlocked(false);
      setHasFrameLoaded(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsFrameBlocked(true), FRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [url]);

  function openInNewTab(): void {
    if (url !== null) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <Dialog open={url !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {url !== null && isFrameBlocked && !hasFrameLoaded ? (
          <InlineNotice tone="warning">{t('frameBlocked')}</InlineNotice>
        ) : null}
        {url !== null ? (
          <iframe
            title={t('frameTitle')}
            src={url}
            className="h-[70vh] w-full rounded-md border border-slate-200 bg-white"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
            data-testid="patient-kyc-frame"
            onLoad={() => setHasFrameLoaded(true)}
          />
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={openInNewTab}>
            <Icon name="open_in_new" size={16} />
            {t('openInNewTab')}
          </Button>
          <Button type="button" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
