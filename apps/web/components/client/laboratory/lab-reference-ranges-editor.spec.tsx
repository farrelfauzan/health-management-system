import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LabReferenceRangesEditor } from './lab-reference-ranges-editor';
import operationsMessages from '../../../messages/id/operations.json';
import { createEmptyLabReferenceRangeDraft } from '#lib/laboratory/lab-reference-range-draft';

type RenderParams = {
  drafts?: ReturnType<typeof createEmptyLabReferenceRangeDraft>[];
  isNumeric?: boolean;
  error?: string | null;
  onChange?: (drafts: ReturnType<typeof createEmptyLabReferenceRangeDraft>[]) => void;
};

function renderEditor(params: RenderParams = {}): void {
  render(
    <NextIntlClientProvider locale="id" messages={operationsMessages} timeZone="Asia/Jakarta">
      <LabReferenceRangesEditor
        drafts={params.drafts ?? []}
        isNumeric={params.isNumeric ?? true}
        disabled={false}
        error={params.error ?? null}
        onChange={params.onChange ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('LabReferenceRangesEditor', () => {
  it('says there are no bands rather than showing an empty list', () => {
    renderEditor();

    expect(screen.getByText(/belum ada rentang/i)).toBeInTheDocument();
  });

  it('adds a band on the button', async () => {
    const onChange = vi.fn();
    renderEditor({ onChange });

    await userEvent.click(screen.getByRole('button', { name: /tambah rentang/i }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ sex: '', low: '' })]);
  });

  // A coded urine protein has a normal answer and no number to be above or
  // below, so its band is one text field, not four numbers.
  it('shows the normal-answer column for a non-numeric test instead of the numeric bounds', () => {
    renderEditor({ drafts: [createEmptyLabReferenceRangeDraft('a')], isNumeric: false });

    expect(screen.getByText('Jawaban normal')).toBeInTheDocument();
    expect(screen.queryByText('Batas bawah')).not.toBeInTheDocument();
  });

  it('shows the dialog’s verdict beside the rows', () => {
    renderEditor({
      drafts: [createEmptyLabReferenceRangeDraft('a')],
      error: 'Rentang 1 dan 2 tumpang tindih: satu pasien akan cocok dengan keduanya.',
    });

    expect(screen.getByTestId('lab-reference-ranges-error')).toHaveTextContent('tumpang tindih');
  });
});
