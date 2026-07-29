import type { InvoiceGenerationGap } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InvoiceGenerationGapList } from './invoice-generation-gap-list';

describe('InvoiceGenerationGapList', () => {
  it('confirms explicitly when nothing was left unpriced', () => {
    render(<InvoiceGenerationGapList gaps={[]} />);

    expect(screen.getByText(/Everything billable on this visit was priced/)).toBeInTheDocument();
  });

  it('surfaces each gap with the fix, since a gap is money left unbilled', () => {
    const gaps: InvoiceGenerationGap[] = [
      { reason: 'NO_CONSULTATION_TARIFF', description: 'Consultation fee' },
      { reason: 'NO_TARIFF_FOR_PROCEDURE', description: 'Wound dressing', code: '93.57' },
    ];

    render(<InvoiceGenerationGapList gaps={gaps} />);

    expect(screen.getByText('2 items could not be priced')).toBeInTheDocument();
    expect(screen.getByText('Consultation fee')).toBeInTheDocument();
    expect(screen.getByText('(93.57)')).toBeInTheDocument();
    expect(screen.getByText(/add a tariff with its ICD-9-CM code/i)).toBeInTheDocument();
  });

  it('keeps the count singular for one gap', () => {
    render(
      <InvoiceGenerationGapList
        gaps={[{ reason: 'UNPRICED_MEDICATION', description: 'Paracetamol 500mg' }]}
      />,
    );

    expect(screen.getByText('1 item could not be priced')).toBeInTheDocument();
  });
});
