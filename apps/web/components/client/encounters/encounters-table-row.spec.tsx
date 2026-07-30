import type { EncounterListItem, EncounterStatusValue } from '@hms/shared-types';
import { Table, TableBody } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { EncountersTableRow } from './encounters-table-row';
import messages from '../../../messages/id/clinical.json';

function buildEncounter(overrides: Partial<EncounterListItem> = {}): EncounterListItem {
  return {
    id: 'encounter-1',
    registrationId: 'registration-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    status: 'IN_PROGRESS' as EncounterStatusValue,
    startedAt: '2026-07-18T08:00:00.000Z',
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
    doctor: { id: 'doctor-1', licenseNumber: 'STR-1', fullName: 'Dr. Budi Santoso' },
    vitalSignsCount: 2,
    diagnosisCount: 1,
    procedureCount: 0,
    ...overrides,
  };
}

function renderRow(encounter: EncounterListItem): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <Table>
        <TableBody>
          <EncountersTableRow encounter={encounter} basePath="/admin/encounters" />
        </TableBody>
      </Table>
    </NextIntlClientProvider>,
  );
}

describe('EncountersTableRow', () => {
  it('renders the patient identity, attending doctor, and status', () => {
    renderRow(buildEncounter());

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('MRN-0001')).toBeInTheDocument();
    expect(screen.getByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Berlangsung')).toBeInTheDocument();
  });

  it('links to the encounter workspace', () => {
    renderRow(buildEncounter());

    expect(screen.getByRole('link', { name: /Buka/ })).toHaveAttribute(
      'href',
      '/admin/encounters/encounter-1',
    );
  });

  it('links within whichever shell renders it', () => {
    render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <Table>
          <TableBody>
            <EncountersTableRow encounter={buildEncounter()} basePath="/doctor/encounters" />
          </TableBody>
        </Table>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('link', { name: /Buka/ })).toHaveAttribute(
      'href',
      '/doctor/encounters/encounter-1',
    );
  });

  it('shows the coded record counts', () => {
    renderRow(buildEncounter({ vitalSignsCount: 3, diagnosisCount: 2, procedureCount: 1 }));

    expect(screen.getByTitle('Set tanda vital yang dicatat')).toHaveTextContent('3');
    expect(screen.getByTitle('Diagnosis yang dikodekan')).toHaveTextContent('2');
    expect(screen.getByTitle('Tindakan yang dikodekan')).toHaveTextContent('1');
  });

  it('reports the elapsed time of a closed encounter, not the time since now', () => {
    renderRow(
      buildEncounter({
        status: 'FINISHED',
        endedAt: '2026-07-18T09:12:00.000Z',
      }),
    );

    expect(screen.getByText('1 jam 12 mnt')).toBeInTheDocument();
  });
});
