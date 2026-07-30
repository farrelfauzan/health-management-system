import type { DoctorLicense } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { DoctorLicensesCard } from './doctor-licenses-card';
import messages from '../../../messages/id/clinical.json';

function renderCard(licenses: DoctorLicense[]): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <DoctorLicensesCard licenses={licenses} />
    </NextIntlClientProvider>,
  );
}

function buildLicense(overrides: Partial<DoctorLicense> = {}): DoctorLicense {
  return {
    id: 'license-1',
    type: 'SIP',
    licenseNumber: 'SIP-001',
    issuedAt: '2024-01-01',
    expiresAt: '2027-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DoctorLicensesCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prompts for a licence when none is recorded', () => {
    renderCard([]);

    expect(screen.getByText(/Dokter yang berpraktik memerlukan STR/)).toBeInTheDocument();
  });

  it('marks an expired SIP, which is what a licensing audit looks for', () => {
    renderCard([buildLicense({ expiresAt: '2026-01-01' })]);

    expect(screen.getByText('Kedaluwarsa')).toBeInTheDocument();
    expect(screen.getByText('1 perlu perhatian')).toBeInTheDocument();
  });

  it('warns before a SIP lapses rather than only after', () => {
    renderCard([buildLicense({ expiresAt: '2026-08-15' })]);

    expect(screen.getByText('Segera kedaluwarsa')).toBeInTheDocument();
  });

  it('does not flag an STR with no expiry as a problem', () => {
    renderCard([buildLicense({ type: 'STR', licenseNumber: 'STR-001', expiresAt: undefined })]);

    expect(screen.getByText('Tanpa masa berlaku')).toBeInTheDocument();
    expect(screen.queryByText(/need attention/)).not.toBeInTheDocument();
  });
});
