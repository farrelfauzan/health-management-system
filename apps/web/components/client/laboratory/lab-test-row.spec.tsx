import type { LabTestView } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LabTestRow } from './lab-test-row';
import messages from '../../../messages/id/operations.json';

function buildLabTest(overrides: Partial<LabTestView> = {}): LabTestView {
  return {
    id: 'test-1',
    code: 'HB',
    name: 'Hemoglobin',
    loincCode: '718-7',
    loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
    specimenType: 'WHOLE_BLOOD',
    resultType: 'NUMERIC',
    unit: 'g/dL',
    decimals: 1,
    codedOptions: [],
    isActive: true,
    referenceRanges: [],
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    ...overrides,
  };
}

function renderRow(labTest: LabTestView): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <LabTestRow labTest={labTest} />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('LabTestRow', () => {
  it('shows both sex-banded ranges rather than collapsing them', () => {
    renderRow(
      buildLabTest({
        referenceRanges: [
          { id: 'r1', sex: 'MALE', low: 13.2, high: 17.3 },
          { id: 'r2', sex: 'FEMALE', low: 11.7, high: 15.5 },
        ],
      }),
    );

    expect(screen.getByText('13.2 – 17.3')).toBeInTheDocument();
    expect(screen.getByText('11.7 – 15.5')).toBeInTheDocument();
  });

  it('says there is no reference range rather than showing an empty cell', () => {
    // The acceptance criterion behind the paediatric gap: a child's result
    // must not be measured against an adult band, so the absence is stated.
    renderRow(buildLabTest({ referenceRanges: [] }));

    expect(screen.getByText('Tidak ada rentang rujukan')).toBeInTheDocument();
  });

  it('says a test carries no LOINC code, since that decides whether it is reported', () => {
    renderRow(buildLabTest({ loincCode: undefined, loincDisplay: undefined }));

    expect(screen.getByText(/Tanpa kode LOINC/)).toBeInTheDocument();
  });

  it('says a test is unpriced rather than showing it as free', () => {
    renderRow(buildLabTest({ price: undefined }));

    expect(screen.getByText('Belum ada tarif')).toBeInTheDocument();
  });

  it('renders a price when one is set', () => {
    renderRow(buildLabTest({ price: 35000 }));

    expect(screen.getByText(/35.000/)).toBeInTheDocument();
  });

  it('marks a retired test inactive', () => {
    renderRow(buildLabTest({ isActive: false }));

    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
  });
});
