import { SidebarProvider } from '@hms/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarBrand } from './sidebar-brand';

function renderBrand(): void {
  render(
    <SidebarProvider>
      <SidebarBrand />
    </SidebarProvider>,
  );
}

describe('SidebarBrand', () => {
  it('renders the facility logo, not a placeholder icon', () => {
    renderBrand();

    const logo = screen.getByAltText('Saling Jaga logo');

    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute('src')).toContain('saling-jaga-mark.png');
  });

  it('links the brand back to the dashboard', () => {
    renderBrand();

    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/dashboard');
  });
});
