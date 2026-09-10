import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { PageBreadcrumbs } from './page-breadcrumbs';
import enMessages from '../../messages/en/shared.json';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const PATIENT_TRAIL: BreadcrumbTrailItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Patients', href: '/admin/patients' },
  { label: 'Siti Rahma' },
];

const LONG_TRAIL: BreadcrumbTrailItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Doctors', href: '/admin/doctors' },
  { label: 'Licence expiry', href: '/admin/doctors/licence-expiry' },
  { label: 'dr. Budi Santoso' },
];

function renderTrail(items: BreadcrumbTrailItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PageBreadcrumbs items={items} />
    </NextIntlClientProvider>,
  );
}

describe('PageBreadcrumbs', () => {
  it('links every parent segment to its page', () => {
    renderTrail(PATIENT_TRAIL);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Patients' })).toHaveAttribute(
      'href',
      '/admin/patients',
    );
  });

  it('announces the last segment as the current page and does not link it', () => {
    renderTrail(PATIENT_TRAIL);

    const currentPage = screen.getByText('Siti Rahma');
    expect(currentPage).toHaveAttribute('aria-current', 'page');
    expect(currentPage).not.toHaveAttribute('href');
    expect(currentPage.closest('a')).toBeNull();
  });

  it('renders a parent that has no page of its own as plain text', () => {
    renderTrail([
      { label: 'Dashboard', href: '/admin/dashboard' },
      { label: 'Advanced' },
      { label: 'Integrations' },
    ]);

    const grouping = screen.getByText('Advanced');
    expect(grouping.closest('a')).toBeNull();
    expect(grouping).not.toHaveAttribute('aria-current');
  });

  it('names the landmark for assistive technology', () => {
    renderTrail(PATIENT_TRAIL);

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('keeps a three-segment trail whole on every screen', () => {
    renderTrail(PATIENT_TRAIL);

    expect(screen.queryByTestId('breadcrumb-ellipsis')).toBeNull();
    expect(screen.getByRole('link', { name: 'Patients' }).closest('li')?.className).not.toContain(
      'hidden',
    );
  });

  it('folds the middle of a long trail behind an ellipsis on a phone, keeping every segment in the DOM', () => {
    renderTrail(LONG_TRAIL);

    expect(screen.getByTestId('breadcrumb-ellipsis').className).toContain('sm:hidden');
    expect(screen.getByRole('link', { name: 'Doctors' }).closest('li')?.className).toContain(
      'hidden sm:inline-flex',
    );
    expect(screen.getByRole('link', { name: 'Licence expiry' }).closest('li')?.className).toContain(
      'hidden sm:inline-flex',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' }).closest('li')?.className).not.toContain(
      'hidden',
    );
    expect(screen.getByText('dr. Budi Santoso').closest('li')?.className).not.toContain('hidden');
  });

  it('renders nothing for an empty trail', () => {
    const { container } = renderTrail([]);

    expect(container).toBeEmptyDOMElement();
  });
});
