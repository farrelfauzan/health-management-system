'use client';

import { useState } from 'react';
import type {
  DeliveryChannelValue,
  DeliveryShapeValue,
  InvoiceDetail,
  RequestInvoiceDeliveryInput,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SendInvoiceChannelOption } from '#components/client/billing/send-invoice-channel-option';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { buildSendAt } from '#lib/document-delivery/build-send-at';
import { resolveDeliveryRefusal } from '#lib/document-delivery/resolve-delivery-refusal';
import { usePatientDeliveryConsents } from '#lib/document-delivery/use-patient-delivery-consents';
import { useRequestInvoiceDelivery } from '#lib/document-delivery/use-request-invoice-delivery';

type SendInvoiceDialogProps = {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SHAPES: readonly DeliveryShapeValue[] = ['ATTACHMENT', 'LINK'];

/**
 * The send dialog (P16-T27, FR-E4-01/04/05/09).
 *
 * Channels come pre-judged from the patient's readiness view: a channel the
 * patient cannot receive on is disabled with its reason, never silently
 * dropped. The attachment is the default shape (D-027); a link is the
 * per-request override. Scheduling is one more field, and the copy says what
 * the worker does with it — re-checks everything when it fires.
 *
 * The server judges again on submit; a refusal that changed between the look
 * and the click is shown against its channel with the same sentence.
 */
export function SendInvoiceDialog({ invoice, open, onOpenChange }: SendInvoiceDialogProps) {
  const t = useTranslations('operations.billing.delivery');
  const tc = useTranslations('clinical.deliveryConsent');
  const readinessQuery = usePatientDeliveryConsents(invoice.patientId);
  const requestMutation = useRequestInvoiceDelivery(invoice.id, t('requestError'));
  const [channels, setChannels] = useState<DeliveryChannelValue[]>([]);
  const [shape, setShape] = useState<DeliveryShapeValue>('ATTACHMENT');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [sendDate, setSendDate] = useState<string>('');
  const [sendTime, setSendTime] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const readiness = readinessQuery.consents?.channels ?? [];
  const hasAvailableChannel = readiness.some((entry) => entry.isDeliveryAllowed);
  const isBusy = requestMutation.isPending;
  const today = new Date().toISOString().slice(0, 10);

  function toggleChannel(channel: DeliveryChannelValue, isChecked: boolean): void {
    setChannels((current) =>
      isChecked
        ? [...current.filter((entry) => entry !== channel), channel]
        : current.filter((entry) => entry !== channel),
    );
  }

  function buildInput(): RequestInvoiceDeliveryInput | null {
    if (channels.length === 0) {
      setFormError(t('noChannelSelected'));
      return null;
    }
    if (!isScheduled) {
      return { channels, shape };
    }
    const sendAt = buildSendAt(sendDate, sendTime);
    if (sendAt === null || new Date(sendAt).getTime() <= Date.now()) {
      setFormError(t('scheduleInPast'));
      return null;
    }
    return { channels, shape, sendAt };
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const input = buildInput();
    if (input === null) {
      return;
    }
    try {
      await requestMutation.mutateAsync(input);
      setChannels([]);
      onOpenChange(false);
    } catch (error) {
      const refusal = resolveDeliveryRefusal(error);
      setFormError(
        refusal
          ? t('refusedChannel', {
              channel: t(`channelLabels.${refusal.channel}`),
              reason: tc(`refusals.${refusal.refusalReason}`),
            })
          : resolveApiErrorMessage(error, t('requestError')),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('channels')}</p>
            {readinessQuery.isPending ? <Skeleton className="h-20 w-full" /> : null}
            {readinessQuery.isError ? (
              <p role="alert" className="text-sm text-rose-700">
                {tc('loadError')}
              </p>
            ) : null}
            {readiness.length > 0 ? (
              <ul className="space-y-2">
                {readiness.map((entry) => (
                  <SendInvoiceChannelOption
                    key={entry.channel}
                    readiness={entry}
                    isChecked={channels.includes(entry.channel)}
                    isDisabled={isBusy}
                    onCheckedChange={(isChecked) => toggleChannel(entry.channel, isChecked)}
                  />
                ))}
              </ul>
            ) : null}
            {readinessQuery.consents && !hasAvailableChannel ? (
              <p className="text-xs text-amber-800">{t('noChannelAvailable')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-invoice-shape">{t('shape')}</Label>
            <Select value={shape} onValueChange={(value) => setShape(value as DeliveryShapeValue)}>
              <SelectTrigger id="send-invoice-shape" className="w-full" disabled={isBusy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHAPES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`shapes.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shape === 'ATTACHMENT' ? (
              <p className="text-xs text-slate-500">{t('passwordNote')}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-invoice-schedule"
                checked={isScheduled}
                disabled={isBusy}
                onCheckedChange={(value) => setIsScheduled(value === true)}
              />
              <Label htmlFor="send-invoice-schedule" className="text-sm">
                {t('schedule')}
              </Label>
            </div>
            {isScheduled ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="send-invoice-date" className="text-xs">
                    {t('scheduleDate')}
                  </Label>
                  <DatePicker
                    id="send-invoice-date"
                    value={sendDate}
                    onValueChange={setSendDate}
                    minValue={today}
                    disabled={isBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="send-invoice-time" className="text-xs">
                    {t('scheduleTime')}
                  </Label>
                  <Input
                    id="send-invoice-time"
                    type="time"
                    value={sendTime}
                    disabled={isBusy}
                    onChange={(event) => setSendTime(event.target.value)}
                  />
                </div>
                <p className="col-span-2 text-xs text-slate-500">{t('scheduleHint')}</p>
              </div>
            ) : null}
          </div>

          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              {t('cancelDialog')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              disabled={isBusy || !hasAvailableChannel}
              onClick={() => void handleSubmit()}
            >
              {isBusy ? t('submitting') : t('submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
