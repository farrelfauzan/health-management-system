import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';

import { GlobalSearch } from './global-search';
import { adminManagementControllerListUsersV1 } from '#lib/api/generated/admin-management/admin-management';
import { doctorManagementControllerListDoctorsV1 } from '#lib/api/generated/doctor-management/doctor-management';
import { patientManagementControllerListPatientsV1 } from '#lib/api/generated/patient-management/patient-management';
import messages from '../../../messages/id/auth-shell.json';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
}));

vi.mock('#lib/api/generated/patient-management/patient-management', () => ({
  patientManagementControllerListPatientsV1: vi.fn(),
  getPatientManagementControllerListPatientsV1QueryKey: (params?: unknown) => [
    'patients',
    params,
  ],
}));

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerListDoctorsV1: vi.fn(),
  getDoctorManagementControllerListDoctorsV1QueryKey: (params?: unknown) => ['doctors', params],
}));

vi.mock('#lib/api/generated/admin-management/admin-management', () => ({
  adminManagementControllerListUsersV1: vi.fn(),
  getAdminManagementControllerListUsersV1QueryKey: (params?: unknown) => ['users', params],
}));

const patientsRequestMock = vi.mocked(patientManagementControllerListPatientsV1);
const doctorsRequestMock = vi.mocked(doctorManagementControllerListDoctorsV1);
const usersRequestMock = vi.mocked(adminManagementControllerListUsersV1);

const FULL_READ_RULES: AppRule[] = [
  { action: 'read', subject: 'Patient' },
  { action: 'read', subject: 'Doctor' },
  { action: 'read', subject: 'User' },
];

function mockListResponse(items: unknown[]): {
  status: number;
  data: { data: unknown[]; meta: { page: number; limit: number; total: number } };
} {
  return {
    status: 200,
    data: { data: items, meta: { page: 1, limit: 5, total: items.length } },
  };
}

function renderGlobalSearch(rules: AppRule[]): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider ability={buildAppAbility(rules)}>
        <NextIntlClientProvider locale="id" messages={messages}>
          <GlobalSearch />
        </NextIntlClientProvider>
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

function mockEmptyResponses(): void {
  patientsRequestMock.mockResolvedValue(
    mockListResponse([]) as never,
  );
  doctorsRequestMock.mockResolvedValue(mockListResponse([]) as never);
  usersRequestMock.mockResolvedValue(mockListResponse([]) as never);
}

describe('GlobalSearch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the platform-matching shortcut hint on the trigger', async () => {
    mockEmptyResponses();
    renderGlobalSearch(FULL_READ_RULES);

    // jsdom reports no Apple platform, so the hint resolves to the Ctrl form.
    expect(await screen.findByText('Ctrl+K')).toBeInTheDocument();
    expect(screen.queryByText('⌘K')).not.toBeInTheDocument();
  });

  it('opens the palette with the keyboard shortcut and shows grouped results', async () => {
    const user = userEvent.setup();
    patientsRequestMock.mockResolvedValue(
      mockListResponse([
        { id: 'patient-1', fullName: 'Budi Santoso', mrn: 'MRN-0001' },
      ]) as never,
    );
    doctorsRequestMock.mockResolvedValue(
      mockListResponse([
        { id: 'doctor-1', fullName: 'dr. Sari Wijaya', specialty: 'Kardiologi' },
      ]) as never,
    );
    usersRequestMock.mockResolvedValue(
      mockListResponse([
        { id: 'user-1', email: 'admin@example.test', roles: [{ code: 'ADMIN', name: 'Admin' }] },
      ]) as never,
    );
    renderGlobalSearch(FULL_READ_RULES);

    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(screen.getByPlaceholderText('Cari pasien, dokter, pengguna...'), 'budi');

    expect(await screen.findByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('dr. Sari Wijaya')).toBeInTheDocument();
    expect(screen.getByText('admin@example.test')).toBeInTheDocument();
    expect(screen.getByText('Pasien')).toBeInTheDocument();
    expect(screen.getByText('Dokter')).toBeInTheDocument();
    expect(screen.getByText('Pengguna')).toBeInTheDocument();
  });

  it('navigates to the patient detail page when a patient result is selected', async () => {
    const user = userEvent.setup();
    patientsRequestMock.mockResolvedValue(
      mockListResponse([
        { id: 'patient-1', fullName: 'Budi Santoso', mrn: 'MRN-0001' },
      ]) as never,
    );
    doctorsRequestMock.mockResolvedValue(mockListResponse([]) as never);
    usersRequestMock.mockResolvedValue(mockListResponse([]) as never);
    renderGlobalSearch(FULL_READ_RULES);

    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByPlaceholderText('Cari pasien, dokter, pengguna...'), 'budi');
    await user.click(await screen.findByText('Budi Santoso'));

    expect(pushMock).toHaveBeenCalledWith('/admin/patients/patient-1');
  });

  it('falls back to the patients list when Enter is pressed on free text', async () => {
    const user = userEvent.setup();
    mockEmptyResponses();
    renderGlobalSearch(FULL_READ_RULES);

    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(
      screen.getByPlaceholderText('Cari pasien, dokter, pengguna...'),
      'chest pain',
    );
    await user.keyboard('{Enter}');

    expect(pushMock).toHaveBeenCalledWith('/admin/patients?q=chest%20pain');
  });

  it('shows navigation quick links filtered by the ability', async () => {
    const user = userEvent.setup();
    mockEmptyResponses();
    renderGlobalSearch([{ action: 'read', subject: 'Patient' }]);

    await user.keyboard('{Meta>}k{/Meta}');

    expect(await screen.findByText('Pasien')).toBeInTheDocument();
    expect(screen.queryByText('Administrasi')).not.toBeInTheDocument();
  });

  it('never queries or shows the users group without the user read ability', async () => {
    const user = userEvent.setup();
    mockEmptyResponses();
    patientsRequestMock.mockResolvedValue(
      mockListResponse([
        { id: 'patient-1', fullName: 'Budi Santoso', mrn: 'MRN-0001' },
      ]) as never,
    );
    renderGlobalSearch([
      { action: 'read', subject: 'Patient' },
      { action: 'read', subject: 'Doctor' },
    ]);

    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(screen.getByPlaceholderText('Cari pasien, dokter, pengguna...'), 'budi');
    await screen.findByText('Budi Santoso');

    expect(usersRequestMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Pengguna')).not.toBeInTheDocument();
  });
});
