import type { DoctorDetail } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/clinical.json';

vi.mock('#lib/api/generated/satusehat/satusehat', () => ({
  satusehatLinkControllerLinkDoctorV1: vi.fn(),
}));

vi.mock('#lib/doctors/use-doctor-identifiers', () => ({
  useDoctorIdentifiers: () => ({ identifiers: undefined, isPending: false, error: null }),
}));

const { DoctorIdentifiersCard } = await import('./doctor-identifiers-card');

const RULES: AppRule[] = [{ action: 'link', subject: 'Satusehat' }];

function buildDoctor(overrides: Partial<DoctorDetail> = {}): DoctorDetail {
  return {
    id: 'doctor-1',
    fullName: 'dr. Uji',
    nikMasked: '••••••••0001',
    satusehatPractitionerId: 'ihs-1',
    ...overrides,
  } as DoctorDetail;
}

function renderCard(doctor: DoctorDetail): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <AbilityProvider ability={buildAppAbility(RULES)}>
          <DoctorIdentifiersCard doctor={doctor} isSatusehatEnabled />
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('DoctorIdentifiersCard', () => {
  it('shows the IHS number and hides the link action for a linked doctor', () => {
    renderCard(buildDoctor());

    expect(screen.getByText('ihs-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tautkan ke SATUSEHAT/ })).not.toBeInTheDocument();
  });

  /**
   * The state D-035 creates. `toDoctorResponse` maps the cleared column with
   * `?? undefined`, so an unlinked doctor reaches the client with the field
   * absent — but the card used to test `!== undefined`, which is true for a
   * `null` the API could start sending (or a hand-built object in a test), and
   * the one doctor who needs relinking was the one whose Link button was
   * hidden. Truthiness covers both spellings.
   */
  it('offers the link action again once a NIK change has cleared the link', () => {
    renderCard(buildDoctor({ satusehatPractitionerId: null as unknown as undefined }));

    expect(screen.getByText('Belum terhubung')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ })).toBeInTheDocument();
  });

  it('offers the link action for a doctor that was never linked', () => {
    renderCard(buildDoctor({ satusehatPractitionerId: undefined }));

    expect(screen.getByText('Belum terhubung')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tautkan ke SATUSEHAT/ })).toBeInTheDocument();
  });
});
