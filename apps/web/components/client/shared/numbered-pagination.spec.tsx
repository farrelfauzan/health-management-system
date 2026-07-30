import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { NumberedPagination } from './numbered-pagination';
import idMessages from '../../../messages/id/shared.json';

describe('NumberedPagination', () => {
  it('localizes its summary and accessibility defaults', () => {
    render(
      <NextIntlClientProvider locale="id" messages={idMessages}>
        <NumberedPagination page={2} pageSize={10} total={25} onPageChange={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Menampilkan 11–20 dari 25 item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Halaman 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Halaman berikutnya' })).toBeInTheDocument();
  });
});
