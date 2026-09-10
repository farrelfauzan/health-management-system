import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { useShellBreadcrumbRoot } from './use-shell-breadcrumb-root';
import idAuthShellMessages from '../../messages/id/auth-shell.json';

const { navigation } = vi.hoisted(() => ({
  navigation: { pathname: '/admin/patients' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="id" messages={idAuthShellMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderRoot(pathname: string) {
  navigation.pathname = pathname;
  return renderHook(() => useShellBreadcrumbRoot(), { wrapper: IntlWrapper });
}

describe('useShellBreadcrumbRoot', () => {
  it('starts an admin trail at the dashboard, named the way the sidebar names it', () => {
    const { result } = renderRoot('/admin/patients/abc');

    expect(result.current).toEqual({ label: 'Dasbor', href: '/admin/dashboard' });
  });

  it("starts a doctor trail at the doctor's own home", () => {
    const { result } = renderRoot('/doctor/encounters/abc');

    expect(result.current).toEqual({ label: 'Hari ini', href: '/doctor/dashboard' });
  });
});
