import type { RegistrationListItem, RegistrationStatusValue } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, Table, TableBody, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { RegistrationsTableRow } from './registrations-table-row';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';
import messages from '../../../messages/en/operations.json';

const FULL_ACCESS_RULES: AppRule[] = [
  { action: 'read', subject: 'Registration' },
  { action: 'create', subject: 'Registration' },
  { action: 'update', subject: 'Registration' },
];

const READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'Registration' }];

const CLINICAL_RULES: AppRule[] = [...FULL_ACCESS_RULES, { action: 'write', subject: 'Encounter' }];

const OVERRIDE_RULES: AppRule[] = [
  ...FULL_ACCESS_RULES,
  { action: 'checkin-override', subject: 'Registration' },
];

const LINKED_APPOINTMENT: RegistrationListItem['appointment'] = {
  id: 'appointment-1',
  scheduledAt: '2026-07-18T09:00:00.000Z',
  status: 'SCHEDULED',
  doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso', specialty: 'Internal Medicine' },
};

function buildRegistration(
  status: RegistrationStatusValue,
  appointment?: RegistrationListItem['appointment'],
  todaySession?: RegistrationListItem['todaySession'],
): RegistrationListItem {
  return {
    id: 'registration-1',
    patientId: 'patient-1',
    status,
    registeredAt: '2026-07-18T08:00:00.000Z',
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
    appointment,
    todaySession,
  };
}

function renderRow(params: {
  status: RegistrationStatusValue;
  rules: AppRule[];
  variant: RegistrationsViewVariant;
  appointment?: RegistrationListItem['appointment'];
  todaySession?: RegistrationListItem['todaySession'];
  onTransition?: (
    registration: RegistrationListItem,
    target: 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED',
    isForced?: boolean,
  ) => void;
  onOpenEncounter?: (registration: RegistrationListItem) => void;
}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <AbilityProvider ability={buildAppAbility(params.rules)}>
        <Table>
          <TableBody>
            <RegistrationsTableRow
              registration={buildRegistration(
                params.status,
                params.appointment,
                params.todaySession,
              )}
              variant={params.variant}
              onTransition={params.onTransition ?? vi.fn()}
              onOpenEncounter={params.onOpenEncounter ?? vi.fn()}
            />
          </TableBody>
        </Table>
      </AbilityProvider>
    </NextIntlClientProvider>,
  );
}

describe('RegistrationsTableRow', () => {
  it('renders the patient identity and status badge', () => {
    renderRow({ status: 'PENDING', rules: FULL_ACCESS_RULES, variant: 'admin' });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('MRN-0001')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Walk-in')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders the doctor of the linked appointment', () => {
    renderRow({
      status: 'PENDING',
      rules: FULL_ACCESS_RULES,
      variant: 'admin',
      appointment: {
        id: 'appointment-1',
        scheduledAt: '2026-07-18T09:00:00.000Z',
        status: 'SCHEDULED',
        doctor: { id: 'doctor-1', fullName: 'Dr. Budi Santoso', specialty: 'Internal Medicine' },
      },
    });

    expect(screen.getByText('Dr. Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Internal Medicine')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('offers only API-allowed transitions for a pending registration', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'PENDING', rules: FULL_ACCESS_RULES, variant: 'admin' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.getByRole('menuitem', { name: /Check In/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Cancel Registration/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Complete/ })).not.toBeInTheDocument();
  });

  it('offers complete and cancel for a checked-in registration', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'CHECKED_IN', rules: FULL_ACCESS_RULES, variant: 'admin' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.getByRole('menuitem', { name: /Complete/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Cancel Registration/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Check In/ })).not.toBeInTheDocument();
  });

  it('renders no actions for terminal statuses', () => {
    renderRow({ status: 'COMPLETED', rules: FULL_ACCESS_RULES, variant: 'admin' });

    expect(screen.queryByRole('button', { name: 'Actions for John Doe' })).not.toBeInTheDocument();
  });

  it('hides all actions without the update capability', () => {
    renderRow({ status: 'PENDING', rules: READ_ONLY_RULES, variant: 'admin' });

    expect(screen.queryByRole('button', { name: 'Actions for John Doe' })).not.toBeInTheDocument();
  });

  it('offers opening an encounter for a checked-in registration', async () => {
    const user = userEvent.setup();
    const onOpenEncounter = vi.fn();
    renderRow({
      status: 'CHECKED_IN',
      rules: CLINICAL_RULES,
      variant: 'admin',
      onOpenEncounter,
    });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));
    await user.click(screen.getByRole('menuitem', { name: /Open Encounter/ }));

    expect(onOpenEncounter).toHaveBeenCalledTimes(1);
  });

  it('does not offer an encounter before the patient is checked in', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'PENDING', rules: CLINICAL_RULES, variant: 'admin' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.queryByRole('menuitem', { name: /Open Encounter/ })).not.toBeInTheDocument();
  });

  it('hides the encounter action without the encounter write capability', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'CHECKED_IN', rules: FULL_ACCESS_RULES, variant: 'admin' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.queryByRole('menuitem', { name: /Open Encounter/ })).not.toBeInTheDocument();
  });

  it("shows today's practice hours under the doctor", () => {
    renderRow({
      status: 'PENDING',
      rules: FULL_ACCESS_RULES,
      variant: 'admin',
      appointment: LINKED_APPOINTMENT,
      todaySession: { start: '14:00', end: '17:00', opensAt: '13:00', closesAt: '17:00' },
    });

    expect(screen.getByText('Practises 14:00–17:00 today')).toBeInTheDocument();
  });

  it('says the doctor is not practising when there are no hours today', () => {
    renderRow({
      status: 'PENDING',
      rules: FULL_ACCESS_RULES,
      variant: 'admin',
      appointment: LINKED_APPOINTMENT,
    });

    expect(screen.getByText('Not practising today')).toBeInTheDocument();
  });

  it('disables Check in, with a reason, when the doctor is not practising', async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn();
    renderRow({
      status: 'PENDING',
      rules: FULL_ACCESS_RULES,
      variant: 'admin',
      appointment: LINKED_APPOINTMENT,
      onTransition,
    });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));
    const checkIn = screen.getByRole('menuitem', { name: /Check In/ });

    expect(checkIn).toHaveAttribute('data-disabled');
    expect(checkIn).toHaveAttribute(
      'title',
      'Dr. Budi Santoso has no session today, so this patient can not be checked in',
    );
    expect(screen.queryByRole('menuitem', { name: /Check In Anyway/ })).not.toBeInTheDocument();
  });

  it('leaves Check in enabled while the doctor is practising', async () => {
    const user = userEvent.setup();
    renderRow({
      status: 'PENDING',
      rules: FULL_ACCESS_RULES,
      variant: 'admin',
      appointment: LINKED_APPOINTMENT,
      todaySession: { start: '14:00', end: '17:00', opensAt: '13:00', closesAt: '17:00' },
    });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.getByRole('menuitem', { name: /Check In/ })).not.toHaveAttribute('data-disabled');
  });

  it('offers a forced check-in to a holder of the override capability', async () => {
    const user = userEvent.setup();
    const onTransition = vi.fn();
    renderRow({
      status: 'PENDING',
      rules: OVERRIDE_RULES,
      variant: 'admin',
      appointment: LINKED_APPOINTMENT,
      onTransition,
    });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));
    await user.click(screen.getByRole('menuitem', { name: /Check In Anyway/ }));

    expect(onTransition).toHaveBeenCalledWith(expect.any(Object), 'CHECKED_IN', true);
  });

  // A walk-in with no appointment has no doctor whose hours could gate it, so
  // the rule does not apply and the desk must not be blocked.
  it('leaves a walk-in check-in enabled with no session information', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'PENDING', rules: FULL_ACCESS_RULES, variant: 'admin' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.getByRole('menuitem', { name: /Check In/ })).not.toHaveAttribute('data-disabled');
  });

  it('limits the patient variant to cancellation only', async () => {
    const user = userEvent.setup();
    renderRow({ status: 'PENDING', rules: FULL_ACCESS_RULES, variant: 'patient' });

    await user.click(screen.getByRole('button', { name: 'Actions for John Doe' }));

    expect(screen.getByRole('menuitem', { name: /Cancel Registration/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Check In/ })).not.toBeInTheDocument();
  });
});
