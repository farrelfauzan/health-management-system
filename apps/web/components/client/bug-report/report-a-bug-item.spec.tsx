import {
  AbilityProvider,
  buildAppAbility,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  type AppRule,
} from '@hms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/auth-shell.json';

vi.mock('#lib/api/generated/bug-reports/bug-reports', () => ({
  bugReportControllerSubmitReportV1: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/dashboard' }));

const { ReportABugItem } = await import('./report-a-bug-item');

const REPORTER_RULES: AppRule[] = [{ action: 'create', subject: 'BugReport' }];

function renderItem(options: { rules?: AppRule[]; isEnabled?: boolean } = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={new QueryClient()}>
        <AbilityProvider ability={buildAppAbility(options.rules ?? REPORTER_RULES)}>
          {/*
            Radix refuses to render a menu item outside a menu, and the item is
            only ever used inside the profile menu — so the test renders it where
            it lives, open, rather than in isolation.
          */}
          <DropdownMenu defaultOpen>
            <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
            <DropdownMenuContent>
              <ReportABugItem isEnabled={options.isEnabled ?? true} />
            </DropdownMenuContent>
          </DropdownMenu>
        </AbilityProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('ReportABugItem', () => {
  it('offers the item to a user who may file a report', () => {
    renderItem();

    expect(screen.getByText('Report a bug')).toBeInTheDocument();
  });

  /**
   * The entitlement gate (IMP-9). A clinic that has not bought bug reporting gets
   * no item — and the API refuses the route regardless, so this is visibility
   * only.
   */
  it('renders nothing when the clinic has bug reporting switched off', () => {
    renderItem({ isEnabled: false });

    expect(screen.queryByText('Report a bug')).not.toBeInTheDocument();
  });

  /**
   * The permission gate. A patient's rules never include this subject, which is
   * what keeps the item out of the portal even if a shell ever rendered the menu
   * there.
   */
  it('renders nothing for a user with no BugReport grant', () => {
    renderItem({ rules: [{ action: 'read', subject: 'Patient' }] });

    expect(screen.queryByText('Report a bug')).not.toBeInTheDocument();
  });
});
