import { ADMIN_PORTAL_ADMIN_RULES, buildAppAbility, SidebarProvider, type AppRule } from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './app-sidebar';
import { filterNavSections } from '#lib/shell/filter-nav-sections';
import dashboardAiMessages from '../../../messages/id/dashboard-ai.json';
import messages from '../../../messages/id/auth-shell.json';

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(() => '/admin/dashboard'),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}));

/**
 * The sidebar reads live data now: the conversations entry carries the handoff
 * badge (`PCS-T08`), so a nav item can issue a query. Retries are off and the
 * request fails in jsdom, which is the state under test here — the sidebar
 * must render its links whether or not the count ever arrives.
 */
function renderAppSidebar(rules: AppRule[]): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <NextIntlClientProvider
          locale="id"
          messages={{ ...messages, ...dashboardAiMessages }}
        >
          <AppSidebar sections={filterNavSections(buildAppAbility(rules))} />
        </NextIntlClientProvider>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe('AppSidebar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('highlights the nav item matching the current route', () => {
    usePathnameMock.mockReturnValue('/admin/patients');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    const activeLink = screen.getByRole('link', { name: 'Pasien' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dasbor' })).not.toHaveAttribute('aria-current');
  });

  it('marks the parent nav item active on nested routes', () => {
    usePathnameMock.mockReturnValue('/admin/patients/some-patient-id');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    expect(screen.getByRole('link', { name: 'Pasien' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders every nav item for the full admin rule set', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    const expectedLabels = [
      'Dasbor',
      'Pasien',
      'Dokter',
      'Janji temu',
      'Pendaftaran',
      'Farmasi',
      'Asisten AI',
      'Percakapan',
      'Integrasi',
      'Administrasi',
    ];
    expectedLabels.forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('hides nav items the ability does not grant', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    const inputRules: AppRule[] = [{ action: 'read', subject: 'Patient' }];
    renderAppSidebar(inputRules);

    expect(screen.getByRole('link', { name: 'Pasien' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dasbor' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Asisten AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrasi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Farmasi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administrasi' })).not.toBeInTheDocument();
  });

  it('shows Integrations when either provider monitor is granted', () => {
    renderAppSidebar([{ action: 'read', subject: 'SatusehatSubmission' }]);

    expect(screen.getByRole('link', { name: 'Integrasi' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administrasi' })).not.toBeInTheDocument();
  });
});
