import type { PatientAllergy } from '@hms/shared-types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PatientAllergiesCard } from './patient-allergies-card';

function buildAllergy(overrides: Partial<PatientAllergy> = {}): PatientAllergy {
  return {
    id: 'allergy-1',
    substance: 'Penicillin',
    reaction: 'Rash',
    severity: 'MILD',
    createdAt: '2026-07-18T08:00:00.000Z',
    updatedAt: '2026-07-18T08:00:00.000Z',
    ...overrides,
  };
}

describe('PatientAllergiesCard', () => {
  it('does not claim the patient has no allergies when none are recorded', () => {
    render(<PatientAllergiesCard allergies={[]} />);

    expect(
      screen.getByText(/Absence of a record is not the same as none reported/),
    ).toBeInTheDocument();
  });

  it('lists the most severe allergy first', () => {
    render(
      <PatientAllergiesCard
        allergies={[
          buildAllergy({ id: 'a', substance: 'Dust', severity: 'MILD' }),
          buildAllergy({ id: 'b', substance: 'Peanut', severity: 'SEVERE' }),
          buildAllergy({ id: 'c', substance: 'Pollen', severity: 'MODERATE' }),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');

    expect(within(items[0]!).getByText('Peanut')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Pollen')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Dust')).toBeInTheDocument();
  });

  it('shows the substance, reaction, and severity', () => {
    render(<PatientAllergiesCard allergies={[buildAllergy({ severity: 'SEVERE' })]} />);

    expect(screen.getByText('Penicillin')).toBeInTheDocument();
    expect(screen.getByText('Rash')).toBeInTheDocument();
    expect(screen.getByText('SEVERE')).toBeInTheDocument();
  });
});
