import type { LabOrderItemView, LabTestView } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { LabResultEntryRow } from './lab-result-entry-row';
import clinicalMessages from '../../../messages/id/clinical.json';
import operationsMessages from '../../../messages/id/operations.json';
import { previewLabFlag } from '#lib/laboratory/preview-lab-flag';

const item: LabOrderItemView = {
  id: 'i1',
  labTestId: 't1',
  code: 'HB',
  name: 'Hemoglobin',
  specimenType: 'WHOLE_BLOOD',
  resultType: 'NUMERIC',
  status: 'PENDING',
};

const labTest: LabTestView = {
  id: 't1',
  code: 'HB',
  name: 'Hemoglobin',
  specimenType: 'WHOLE_BLOOD',
  resultType: 'NUMERIC',
  unit: 'g/dL',
  decimals: 1,
  codedOptions: [],
  isActive: true,
  referenceRanges: [{ id: 'r1', sex: 'FEMALE', low: 12, high: 16, criticalLow: 7, criticalHigh: 20 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const patient = {
  id: 'p1',
  fullName: 'Siti Rahayu',
  mrn: 'MRN00000123',
  dateOfBirth: '1990-04-12',
  sex: 'FEMALE' as const,
  ageYears: 36,
};

function renderRow(valueNumeric: string): void {
  const preview = previewLabFlag({
    resultType: 'NUMERIC',
    valueNumeric: valueNumeric === '' ? null : Number(valueNumeric),
    valueText: null,
    valueCoded: null,
    referenceRanges: labTest.referenceRanges,
    patient,
    collectedAt: '2026-09-07T01:15:00.000Z',
  });
  render(
    <NextIntlClientProvider
      locale="id"
      messages={{ ...clinicalMessages, ...operationsMessages }}
      timeZone="Asia/Jakarta"
    >
      <table>
        <tbody>
          <LabResultEntryRow
            item={item}
            labTest={labTest}
            draft={{ valueNumeric, valueText: '', valueCoded: '' }}
            preview={preview}
            isDirty={false}
            disabled={false}
            onChange={vi.fn()}
            onBlur={vi.fn()}
          />
        </tbody>
      </table>
    </NextIntlClientProvider>,
  );
}

/**
 * The acceptance line of P18-T08: a value outside the critical range shows
 * the critical flag before saving. The preview is the server's own function,
 * so the chip on screen is the chip the report will print.
 */
describe('LabResultEntryRow', () => {
  it.each([
    ['11.2', 'L'],
    ['14', 'N'],
    ['17', 'H'],
    ['6.8', 'L!'],
    ['21', 'H!'],
  ])('previews %s as %s before the value is saved', (value, expectedChip) => {
    renderRow(value);

    expect(screen.getByText(expectedChip)).toBeInTheDocument();
    expect(screen.getByText('12 – 16')).toBeInTheDocument();
  });

  it('says so in words when the typed value is critical', () => {
    renderRow('6.8');

    expect(screen.getByText(/nilai kritis/i)).toBeInTheDocument();
  });

  it('shows the unit beside the number and no flag before anything is typed', () => {
    renderRow('');

    expect(screen.getByText('g/dL')).toBeInTheDocument();
    expect(screen.queryByText('N')).not.toBeInTheDocument();
    expect(screen.queryByText('L')).not.toBeInTheDocument();
  });
});
