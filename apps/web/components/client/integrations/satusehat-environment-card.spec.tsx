import type { SatusehatEnvironmentStatus } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

const { useSatusehatEnvironmentMock } = vi.hoisted(() => ({
  useSatusehatEnvironmentMock: vi.fn(),
}));

vi.mock('#lib/integrations/use-satusehat-environment', () => ({
  useSatusehatEnvironment: () => useSatusehatEnvironmentMock(),
}));

const { SatusehatEnvironmentCard } = await import('./satusehat-environment-card');

function renderCard(): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <SatusehatEnvironmentCard />
    </NextIntlClientProvider>,
  );
}

function buildStatus(
  overrides: Partial<SatusehatEnvironmentStatus> = {},
): SatusehatEnvironmentStatus {
  return {
    environment: 'SANDBOX',
    isConfigured: true,
    fhirHost: 'api-satusehat-stg.dto.kemkes.go.id',
    ...overrides,
  };
}

describe('SatusehatEnvironmentCard', () => {
  beforeEach(() => {
    useSatusehatEnvironmentMock.mockReset();
  });

  it('renders nothing while the environment is still loading', () => {
    useSatusehatEnvironmentMock.mockReturnValue({ environment: undefined, isLoading: true });

    renderCard();

    expect(screen.queryByText(/SATUSEHAT:/)).not.toBeInTheDocument();
  });

  /**
   * The whole point of the card. Against the sandbox a green SUBMITTED row
   * below proves the integration works and proves nothing to the patient, so
   * the sandbox is the state that has to say so out loud.
   */
  it('warns that sandbox submissions never reach the patient', () => {
    useSatusehatEnvironmentMock.mockReturnValue({ environment: buildStatus(), isLoading: false });

    renderCard();

    expect(screen.getByText('SATUSEHAT: Sandbox (uji coba)')).toBeInTheDocument();
    expect(screen.getByText(/hanya terkirim ke platform uji coba/)).toBeInTheDocument();
    expect(screen.getByText('api-satusehat-stg.dto.kemkes.go.id')).toBeInTheDocument();
  });

  it('states production plainly', () => {
    useSatusehatEnvironmentMock.mockReturnValue({
      environment: buildStatus({
        environment: 'PRODUCTION',
        fhirHost: 'api-satusehat.dto.kemkes.go.id',
      }),
      isLoading: false,
    });

    renderCard();

    expect(screen.getByText('SATUSEHAT: Produksi')).toBeInTheDocument();
    expect(screen.getByText(/rekam medis nasional/)).toBeInTheDocument();
  });

  it('says it cannot tell when the host is unrecognised', () => {
    useSatusehatEnvironmentMock.mockReturnValue({
      environment: buildStatus({ environment: 'UNKNOWN', fhirHost: 'satusehat.internal.example' }),
      isLoading: false,
    });

    renderCard();

    expect(screen.getByText('SATUSEHAT: Lingkungan tidak dikenali')).toBeInTheDocument();
    expect(screen.getByText(/tidak dapat dipastikan/)).toBeInTheDocument();
  });

  it('reports unset credentials instead of describing where data goes', () => {
    useSatusehatEnvironmentMock.mockReturnValue({
      environment: buildStatus({ isConfigured: false }),
      isLoading: false,
    });

    renderCard();

    expect(screen.getByText(/Kredensial SATUSEHAT belum diatur/)).toBeInTheDocument();
    expect(screen.queryByText(/hanya terkirim ke platform uji coba/)).not.toBeInTheDocument();
  });
});
