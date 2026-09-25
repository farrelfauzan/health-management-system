import type { InvoiceGenerationGap } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import enMessages from '../../../messages/en/operations.json';
import idMessages from '../../../messages/id/operations.json';
import { InvoiceGenerationGapList } from './invoice-generation-gap-list';

function renderGaps(gaps: InvoiceGenerationGap[], locale: 'en' | 'id' = 'en'): void {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? enMessages : idMessages}
      timeZone="Asia/Jakarta"
    >
      <InvoiceGenerationGapList gaps={gaps} />
    </NextIntlClientProvider>,
  );
}

describe('InvoiceGenerationGapList', () => {
  it('confirms explicitly when nothing was left unpriced', () => {
    renderGaps([]);

    expect(screen.getByText(/Everything billable on this visit was priced/)).toBeInTheDocument();
  });

  it('surfaces each gap with the fix, since a gap is money left unbilled', () => {
    const gaps: InvoiceGenerationGap[] = [
      { reason: 'NO_CONSULTATION_TARIFF', description: 'Consultation fee' },
      { reason: 'NO_TARIFF_FOR_PROCEDURE', description: 'Wound dressing', code: '93.57' },
    ];

    renderGaps(gaps);

    expect(screen.getByText('2 items could not be priced')).toBeInTheDocument();
    expect(screen.getByText('Consultation fee')).toBeInTheDocument();
    expect(screen.getByText('(93.57)')).toBeInTheDocument();
    expect(screen.getByText(/add a tariff with its ICD-9-CM code/i)).toBeInTheDocument();
  });

  it('keeps the count singular for one gap', () => {
    renderGaps([{ reason: 'UNPRICED_MEDICATION', description: 'Paracetamol 500mg' }]);

    expect(screen.getByText('1 item could not be priced')).toBeInTheDocument();
  });

  it('speaks Indonesian to an Indonesian cashier', () => {
    renderGaps([{ reason: 'UNPRICED_MEDICATION', description: 'Paracetamol 500mg' }], 'id');

    expect(screen.getByText('1 layanan tidak dapat diberi harga')).toBeInTheDocument();
    expect(screen.getByText(/belum punya harga/)).toBeInTheDocument();
  });

  it('has a message in both languages for every reason the generator reports', () => {
    const idReasons = Object.keys(idMessages.operations.billing.gaps.reasons).sort();
    const enReasons = Object.keys(enMessages.operations.billing.gaps.reasons).sort();

    expect(idReasons).toEqual(enReasons);
    expect(idReasons).toHaveLength(10);
  });
});
