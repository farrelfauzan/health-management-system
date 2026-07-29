import { describe, expect, it } from 'vitest';

import { formatBloodType, formatGuardian, formatOptionalLabel } from './format-patient-fields';

describe('formatBloodType', () => {
  it('joins the group and rhesus into one clinical fact', () => {
    expect(formatBloodType('O', 'POSITIVE')).toBe('O+');
    expect(formatBloodType('AB', 'NEGATIVE')).toBe('AB−');
  });

  it('shows a known group with an unknown rhesus', () => {
    expect(formatBloodType('A', undefined)).toBe('A');
  });

  it('marks an unknown group that has a known rhesus', () => {
    expect(formatBloodType(undefined, 'POSITIVE')).toBe('?+');
  });

  it('falls back to a dash when neither is recorded', () => {
    expect(formatBloodType(undefined, undefined)).toBe('—');
  });
});

describe('formatGuardian', () => {
  it('adds the relation in parentheses when present', () => {
    expect(formatGuardian('Budi', 'Ayah')).toBe('Budi (Ayah)');
  });

  it('renders the name alone when no relation is recorded', () => {
    expect(formatGuardian('Budi', undefined)).toBe('Budi');
  });

  it('shows a dash when no guardian is recorded', () => {
    expect(formatGuardian(undefined, 'Ayah')).toBe('—');
  });
});

describe('formatOptionalLabel', () => {
  it('humanises an enum value', () => {
    expect(formatOptionalLabel('MARRIED')).toBe('MARRIED');
  });

  it('shows a dash when absent', () => {
    expect(formatOptionalLabel(undefined)).toBe('—');
  });
});
