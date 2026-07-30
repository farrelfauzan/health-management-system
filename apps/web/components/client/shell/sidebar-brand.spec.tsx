import { SidebarProvider } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { SidebarBrand } from './sidebar-brand';
import messages from '../../../messages/id/auth-shell.json';

function renderBrand(): void {
  render(
    <SidebarProvider>
      <NextIntlClientProvider locale="id" messages={messages}>
        <SidebarBrand />
      </NextIntlClientProvider>
    </SidebarProvider>,
  );
}

describe('SidebarBrand', () => {
  it('renders the facility logo, not a placeholder icon', () => {
    renderBrand();

    const logo = screen.getByAltText('Logo Saling Jaga');

    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute('src')).toContain('saling-jaga-mark.png');
  });

  it('links the brand back to the dashboard', () => {
    renderBrand();

    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/dashboard');
  });
});
