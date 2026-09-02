import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentsFilters } from './documents-filters';
import messages from '../../../messages/en/clinical.json';
import type { PatientDocumentsFilters } from '#lib/patient-documents/patient-documents-filters';

function renderFilters(filters: PatientDocumentsFilters): ReturnType<typeof vi.fn> {
  const onFiltersChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <DocumentsFilters filters={filters} onFiltersChange={onFiltersChange} />
    </NextIntlClientProvider>,
  );
  return onFiltersChange;
}

describe('DocumentsFilters', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('combines a category with the dates already set', async () => {
    const user = userEvent.setup();
    const onFiltersChange = renderFilters({
      documentDateFrom: '2026-03-01',
      documentDateTo: '2026-03-31',
    });

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'Lab result' }));

    // "Lab results from this March" in two moves: the new category narrows
    // the range instead of replacing it.
    expect(onFiltersChange).toHaveBeenCalledWith({
      documentDateFrom: '2026-03-01',
      documentDateTo: '2026-03-31',
      category: 'LAB_RESULT',
    });
  });

  it('clears every filter at once', async () => {
    const user = userEvent.setup();
    const onFiltersChange = renderFilters({
      category: 'RADIOLOGY',
      documentDateFrom: '2026-03-01',
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onFiltersChange).toHaveBeenCalledWith({});
  });

  it('has nothing to clear on an unfiltered list', () => {
    renderFilters({});

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });
});
