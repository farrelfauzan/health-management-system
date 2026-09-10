import { SidebarProvider } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';

import { SidebarBrand } from './sidebar-brand';
import messages from '../../../messages/id/auth-shell.json';

function renderBrand(defaultOpen: boolean = true): void {
  render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <SidebarBrand />
      </NextIntlClientProvider>
    </SidebarProvider>,
  );
}

describe('SidebarBrand', () => {
  afterEach(() => {
    document.cookie = 'sidebar_state=; path=/; max-age=0';
  });

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

  it('offers a labelled collapse control while expanded', () => {
    renderBrand();

    const toggle = screen.getByRole('button', { name: 'Ciutkan bilah sisi' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers a labelled expand control while collapsed', () => {
    renderBrand(false);

    const toggle = screen.getByRole('button', { name: 'Bentangkan bilah sisi' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapses the sidebar and remembers the choice in the kit cookie', async () => {
    const user = userEvent.setup();
    renderBrand();

    await user.click(screen.getByRole('button', { name: 'Ciutkan bilah sisi' }));

    expect(screen.getByRole('button', { name: 'Bentangkan bilah sisi' })).toBeInTheDocument();
    expect(document.cookie).toContain('sidebar_state=false');
  });

  it('expands the sidebar again from the mark', async () => {
    const user = userEvent.setup();
    renderBrand(false);

    await user.click(screen.getByRole('button', { name: 'Bentangkan bilah sisi' }));

    expect(screen.getByRole('button', { name: 'Ciutkan bilah sisi' })).toBeInTheDocument();
    expect(document.cookie).toContain('sidebar_state=true');
  });

  it('keeps the dashboard link reachable in both states', () => {
    renderBrand(false);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/dashboard');
  });
});
