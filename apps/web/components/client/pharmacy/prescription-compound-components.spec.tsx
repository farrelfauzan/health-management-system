import type { PrescriptionItemComponentResponse } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { PrescriptionCompoundComponents } from './prescription-compound-components';
import messages from '../../../messages/id/operations.json';

function buildComponent(
  overrides: Partial<PrescriptionItemComponentResponse> = {},
): PrescriptionItemComponentResponse {
  return {
    id: 'component-1',
    medicationId: 'medication-1',
    medicationCode: 'PARA-500',
    medicationName: 'Paracetamol 500 mg',
    quantity: 0.5,
    unit: 'TABLET',
    ...overrides,
  };
}

function renderComponents(
  components: PrescriptionItemComponentResponse[],
  compoundQuantity = 10,
): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <PrescriptionCompoundComponents
        components={components}
        compoundQuantity={compoundQuantity}
      />
    </NextIntlClientProvider>,
  );
}

describe('PrescriptionCompoundComponents', () => {
  it('shows what goes into one compound and what the line takes from stock', () => {
    // Half a tablet per bungkus, ten bungkus — five tablets off the shelf.
    renderComponents([buildComponent()], 10);

    expect(screen.getByText('Paracetamol 500 mg')).toBeInTheDocument();
    expect(screen.getByText(/0\.5 TABLET/)).toBeInTheDocument();
    expect(screen.getByText(/total 5 TABLET/)).toBeInTheDocument();
  });

  it('keeps a fractional total legible rather than rounding it away', () => {
    renderComponents([buildComponent({ quantity: 0.3333 })], 3);

    expect(screen.getByText(/total 0\.9999 TABLET/)).toBeInTheDocument();
  });

  it('lists every ingredient', () => {
    renderComponents([
      buildComponent(),
      buildComponent({ id: 'component-2', medicationName: 'CTM 4 mg', quantity: 0.25 }),
    ]);

    expect(screen.getByText('Paracetamol 500 mg')).toBeInTheDocument();
    expect(screen.getByText('CTM 4 mg')).toBeInTheDocument();
  });

  it('renders nothing for a product line, which has no ingredients', () => {
    const { container } = render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <PrescriptionCompoundComponents components={[]} compoundQuantity={10} />
      </NextIntlClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
