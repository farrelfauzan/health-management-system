import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PatientsSearchParams } from '#lib/patients/search-params';
import idClinicalMessages from '../../../messages/id/clinical.json';
import idOperationsMessages from '../../../messages/id/operations.json';
import idSharedMessages from '../../../messages/id/shared.json';

const { pushMock, navigation } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  navigation: { pathname: '/admin/patients', search: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const listProspectivePatientsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/customer-service/customer-service', () => ({
  prospectivePatientControllerListProspectivePatientsV1: listProspectivePatientsMock,
  prospectivePatientControllerListMatchCandidatesV1: vi.fn(),
  prospectivePatientControllerLinkToExistingPatientV1: vi.fn(),
  prospectivePatientControllerConvertToNewPatientV1: vi.fn(),
  getProspectivePatientControllerListProspectivePatientsV1QueryKey: (params: unknown) => [
    'prospective-patients',
    params,
  ],
  getProspectivePatientControllerListMatchCandidatesV1QueryKey: (
    prospectivePatientId: string,
    params: unknown,
  ) => ['prospective-match-candidates', prospectivePatientId, params],
}));

const listPatientsMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/api/generated/patient-management/patient-management', () => ({
  patientManagementControllerListPatientsV1: listPatientsMock,
  getPatientManagementControllerListPatientsV1QueryKey: (params: unknown) => ['patients', params],
}));

const { PatientsWorkspace } = await import('./patients-workspace');

const INITIAL_QUERY: PatientsSearchParams = { page: 1, limit: 20 };

const DESK_RULES: AppRule[] = [
  { action: 'read', subject: 'Patient' },
  { action: 'create', subject: 'Patient' },
  { action: 'update', subject: 'Patient' },
];

const MESSAGES = {
  ...idClinicalMessages,
  ...idOperationsMessages,
  ...idSharedMessages,
};

function renderWorkspace(awaitingTotal: number): void {
  listPatientsMock.mockResolvedValue({
    status: 200,
    data: { data: [], meta: { page: 1, limit: 20, total: 0 } },
  });
  listProspectivePatientsMock.mockResolvedValue({
    status: 200,
    data: { data: [], meta: { page: 1, limit: 1, total: awaitingTotal } },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={MESSAGES} timeZone="Asia/Jakarta">
        <AbilityProvider ability={buildAppAbility(DESK_RULES)}>
          <PatientsWorkspace initialQuery={INITIAL_QUERY} />
        </AbilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('PatientsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushMock.mockReset();
    navigation.search = '';
  });

  it('opens on the directory and offers the chat bookings beside it', async () => {
    renderWorkspace(0);

    expect(await screen.findByRole('tab', { name: 'Direktori' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Dari chat/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('puts the number of people waiting on the tab so the desk sees it unopened', async () => {
    renderWorkspace(4);

    // The whole reason the tab carries a badge (`P19-T08`, feedback Patient
    // #2): the desk never found the arrival worklist because nothing told it
    // there was anybody on it.
    expect(await screen.findByTestId('from-chat-count')).toHaveTextContent('4');
  });

  it('carries no badge when nobody is waiting', async () => {
    renderWorkspace(0);

    await screen.findByRole('tab', { name: 'Direktori' });
    expect(screen.queryByTestId('from-chat-count')).not.toBeInTheDocument();
  });

  it('puts the open tab in the URL so the view can be linked and gone back from', async () => {
    renderWorkspace(1);

    await userEvent.click(await screen.findByRole('tab', { name: /Dari chat/ }));

    expect(pushMock).toHaveBeenCalledWith('/admin/patients?tab=from-chat', { scroll: false });
  });
});
