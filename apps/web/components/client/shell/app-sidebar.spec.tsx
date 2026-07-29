import { ADMIN_PORTAL_ADMIN_RULES, buildAppAbility, SidebarProvider, type AppRule } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './app-sidebar';
import { filterNavSections } from '#lib/shell/filter-nav-sections';

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(() => '/admin/dashboard'),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}));

function renderAppSidebar(rules: AppRule[]): void {
  render(
    <SidebarProvider>
      <AppSidebar sections={filterNavSections(buildAppAbility(rules))} />
    </SidebarProvider>,
  );
}

describe('AppSidebar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('highlights the nav item matching the current route', () => {
    usePathnameMock.mockReturnValue('/admin/patients');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    const activeLink = screen.getByRole('link', { name: 'Patients' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('marks the parent nav item active on nested routes', () => {
    usePathnameMock.mockReturnValue('/admin/patients/some-patient-id');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    expect(screen.getByRole('link', { name: 'Patients' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders every nav item for the full admin rule set', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    renderAppSidebar(ADMIN_PORTAL_ADMIN_RULES);

    const expectedLabels = [
      'Dashboard',
      'Patients',
      'Doctors',
      'Appointments',
      'Registration',
      'Pharmacy',
      'AI Assistant',
      'Integrations',
      'Administration',
    ];
    expectedLabels.forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('hides nav items the ability does not grant', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    const inputRules: AppRule[] = [{ action: 'read', subject: 'Patient' }];
    renderAppSidebar(inputRules);

    expect(screen.getByRole('link', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AI Assistant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Doctors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pharmacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('shows Integrations when either provider monitor is granted', () => {
    renderAppSidebar([{ action: 'read', subject: 'SatusehatSubmission' }]);

    expect(screen.getByRole('link', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });
});
