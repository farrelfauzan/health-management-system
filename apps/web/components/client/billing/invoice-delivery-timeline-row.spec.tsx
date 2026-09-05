import type { DeliveryView } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { InvoiceDeliveryTimelineRow } from './invoice-delivery-timeline-row';
import clinicalMessages from '../../../messages/en/clinical.json';
import operationsMessages from '../../../messages/en/operations.json';
import sharedMessages from '../../../messages/en/shared.json';

function buildDelivery(overrides: Partial<DeliveryView> = {}): DeliveryView {
  return {
    id: 'delivery-1',
    patientId: 'patient-1',
    invoiceId: 'invoice-1',
    documentId: null,
    channel: 'WHATSAPP',
    shape: 'ATTACHMENT',
    destinationMasked: '6281****0024',
    status: 'QUEUED',
    attemptCount: 0,
    sendAt: null,
    passwordSource: 'DOB_DDMMYYYY',
    lastError: null,
    sentAt: null,
    openedAt: null,
    revokedAt: null,
    requestedBy: { id: 'user-1', email: 'kasir@klinik.example' },
    link: null,
    createdAt: '2026-09-29T08:00:00.000Z',
    updatedAt: '2026-09-29T08:00:00.000Z',
    ...overrides,
  };
}

function renderRow(delivery: DeliveryView, canAct = true, onAction = vi.fn()) {
  render(
    <NextIntlClientProvider
      locale="en"
      timeZone="Asia/Jakarta"
      messages={{ ...operationsMessages, ...clinicalMessages, ...sharedMessages }}
    >
      <ul>
        <InvoiceDeliveryTimelineRow
          delivery={delivery}
          canAct={canAct}
          pendingAction={null}
          onAction={onAction}
        />
      </ul>
    </NextIntlClientProvider>,
  );
  return onAction;
}

describe('InvoiceDeliveryTimelineRow', () => {
  it('shows the masked destination, the scheme and who asked — never the number', () => {
    renderRow(buildDelivery());

    expect(screen.getByText('6281****0024')).toBeInTheDocument();
    expect(screen.getByText(/Opens with the date of birth, DDMMYYYY/)).toBeInTheDocument();
    expect(screen.getByText(/Requested by kasir@klinik.example/)).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('offers Cancel on a queued send and nothing else', () => {
    renderRow(buildDelivery({ sendAt: '2026-10-02T02:00:00.000Z' }));

    expect(screen.getByRole('button', { name: 'Cancel send' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByText(/Scheduled for/)).toBeInTheDocument();
  });

  it('offers Retry and Revoke on a failed send, with a plain-language reason', async () => {
    const user = userEvent.setup();
    const onAction = renderRow(
      buildDelivery({
        status: 'FAILED',
        attemptCount: 5,
        lastError: 'ServiceUnavailableException',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onAction).toHaveBeenCalledWith('retry');
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
    expect(
      screen.getByText('The gateway was unavailable. It retries automatically.'),
    ).toBeInTheDocument();
  });

  it('translates a send-time refusal into the consent sentence', () => {
    renderRow(
      buildDelivery({
        status: 'CANCELLED',
        lastError: 'DELIVERY_REFUSED_AT_SEND_TIME:CONSENT_REVOKED',
      }),
    );

    expect(
      screen.getByText('Refused at send time: The patient opted out of delivery on this channel.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no action on an attachment that already went out', () => {
    renderRow(
      buildDelivery({ status: 'SENT', attemptCount: 1, sentAt: '2026-09-29T08:00:12.000Z' }),
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/1 attempt/)).toBeInTheDocument();
  });

  it('lets a sent link be revoked and shows its expiry', () => {
    renderRow(
      buildDelivery({
        shape: 'LINK',
        status: 'OPENED',
        passwordSource: null,
        sentAt: '2026-09-29T08:00:12.000Z',
        openedAt: '2026-09-29T08:14:03.000Z',
        link: {
          expiresAt: '2026-10-06T08:00:12.000Z',
          revokedAt: null,
          openCount: 2,
          lastOpenedAt: '2026-09-29T08:14:03.000Z',
        },
      }),
    );

    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
    expect(screen.getByText(/Link valid until/)).toBeInTheDocument();
    expect(screen.getByText(/2 opens/)).toBeInTheDocument();
  });

  it('hides every action from a reader without the deliver key', () => {
    renderRow(buildDelivery({ status: 'FAILED', lastError: 'SEND_FAILED' }), false);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Failed: SEND_FAILED')).toBeInTheDocument();
  });
});
