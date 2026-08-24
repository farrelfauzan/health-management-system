import type { AdmissionResponse } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { AdmissionsTableRow } from './admissions-table-row';
import operations from '../../../messages/en/operations.json';
import shared from '../../../messages/en/shared.json';

const messages = { ...operations, ...shared };

const BED = {
  id: 'bed-1',
  code: 'A',
  room: { id: 'room-1', code: '201', name: 'Kamar 201', roomClass: { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' } },
  ward: { id: 'ward-1', code: 'MELATI', name: 'Bangsal Melati' },
};

function buildAdmission(overrides: Partial<AdmissionResponse> = {}): AdmissionResponse {
  return {
    id: 'admission-1',
    patientId: 'patient-1',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'Budi Santoso' },
    admittingDoctorId: 'doctor-1',
    admittingDoctor: { id: 'doctor-1', fullName: 'dr. Siti Rahayu' },
    status: 'ADMITTED',
    admittedAt: '2026-09-05T03:00:00.000Z',
    currentBed: BED,
    bedAssignments: [{ id: 'assignment-1', bed: BED, startedAt: '2026-09-05T03:00:00.000Z' }],
    createdAt: '2026-09-05T03:00:00.000Z',
    updatedAt: '2026-09-05T03:00:00.000Z',
    ...overrides,
  };
}

function renderRow(admission: AdmissionResponse, handlers: Record<string, () => void> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <AdmissionsTableRow
            admission={admission}
            canTransfer
            canDischarge
            canCancel
            onOpen={handlers.onOpen ?? vi.fn()}
            onTransfer={handlers.onTransfer ?? vi.fn()}
            onDischarge={handlers.onDischarge ?? vi.fn()}
            onCancel={handlers.onCancel ?? vi.fn()}
          />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('AdmissionsTableRow', () => {
  it('renders the bed as a full address rather than a bare code', () => {
    renderRow(buildAdmission());

    expect(screen.getByText('Bangsal Melati / 201 / A')).toBeInTheDocument();
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('MRN-0001')).toBeInTheDocument();
  });

  it('offers transfer and discharge on an open stay', async () => {
    const user = userEvent.setup();
    const onTransfer = vi.fn();
    renderRow(buildAdmission(), { onTransfer });

    await user.click(screen.getByRole('button', { name: /Actions for Budi Santoso/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Transfer' }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
  });

  it('offers neither on a settled stay', async () => {
    // DISCHARGED and CANCELLED are terminal — the API answers 409, and the
    // menu says so before the click rather than after it.
    const user = userEvent.setup();
    renderRow(buildAdmission({ status: 'DISCHARGED', currentBed: undefined }));

    await user.click(screen.getByRole('button', { name: /Actions for Budi Santoso/ }));

    expect(screen.queryByRole('menuitem', { name: 'Transfer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Discharge' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
  });
});
