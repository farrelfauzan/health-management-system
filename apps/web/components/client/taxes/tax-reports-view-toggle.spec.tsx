import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';
import { TaxReportsViewToggle } from './tax-reports-view-toggle';

describe('TaxReportsViewToggle', () => {
  it('marks the current view and switches to the other one', () => {
    const onChangeMock = vi.fn();
    render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <TaxReportsViewToggle value="table" onChange={onChangeMock} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Tampilan tabel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan kartu' }));

    expect(onChangeMock).toHaveBeenCalledWith('cards');
  });
});
