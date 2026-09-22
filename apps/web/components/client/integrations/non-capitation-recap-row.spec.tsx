import type { NonCapitationRecapLine } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import clinicalMessages from '../../../messages/id/clinical.json';
import operationsMessages from '../../../messages/id/operations.json';
import { NonCapitationRecapRow } from './non-capitation-recap-row';

function buildLine(overrides: Partial<NonCapitationRecapLine> = {}): NonCapitationRecapLine {
  return {
    serviceType: 'DELIVERY_HEALTH_WORKER_TEAM',
    sourceId: '6f1c2a90-3d4b-4c1e-9a55-2d7f0b8e1a01',
    serviceDate: '2026-10-02',
    patientId: '0b4d8f5e-7a2c-4e61-8d3b-5c9a1f2e6b02',
    patientName: 'Siti Aminah',
    bpjsNumberLast4: '4821',
    visitLabel: null,
    examinerProfession: 'MIDWIFE',
    tariffAmount: 800000,
    regulationReference: 'Permenkes 3/2023 Pasal 20',
    documents: [
      { category: 'PARTOGRAPH', isPresent: true },
      { category: 'BIRTH_CERTIFICATE', isPresent: false },
    ],
    isDocumentationComplete: false,
    status: 'DUE_SOON',
    markedAt: null,
    expiresOn: '2027-04-02',
    ...overrides,
  };
}

function renderRow(line: NonCapitationRecapLine, onSelectedChange = vi.fn()): void {
  render(
    <NextIntlClientProvider
      locale="id"
      messages={{ ...operationsMessages, ...clinicalMessages }}
      timeZone="Asia/Jakarta"
    >
      <Table>
        <TableBody>
          <NonCapitationRecapRow
            line={line}
            isSelectable
            isSelected={false}
            onSelectedChange={onSelectedChange}
          />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('NonCapitationRecapRow (P25-T16)', () => {
  it('shows the participant masked, the service, the chip and the checklist', () => {
    renderRow(buildLine());

    expect(screen.getByText('BPJS ····4821')).toBeInTheDocument();
    expect(screen.getByText('Persalinan, tim 2 nakes tanpa dokter')).toBeInTheDocument();
    expect(screen.getByText('Segera jatuh tempo')).toBeInTheDocument();
    expect(screen.getByText(/Partograf/)).toBeInTheDocument();
    expect(screen.getByText(/Surat keterangan lahir/)).toBeInTheDocument();
  });

  it('selects an unsent line and offers no checkbox on a sent one', () => {
    const mockSelectedChange = vi.fn();
    renderRow(buildLine(), mockSelectedChange);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Pilih baris' }));

    expect(mockSelectedChange).toHaveBeenCalledWith(true);
  });

  it('has nothing to select once the line is sent', () => {
    renderRow(buildLine({ status: 'SENT', markedAt: '2026-11-05T02:00:00.000Z' }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Sudah dikirim')).toBeInTheDocument();
  });
});
