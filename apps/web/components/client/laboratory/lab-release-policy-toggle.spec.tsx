import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LabReleasePolicyToggle } from './lab-release-policy-toggle';

describe('LabReleasePolicyToggle', () => {
  it('shows the label and what the setting currently means', () => {
    render(
      <LabReleasePolicyToggle
        label="Technicians may release results"
        description="Only a doctor or an administrator releases results."
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Technicians may release results')).toBeInTheDocument();
    expect(
      screen.getByText('Only a doctor or an administrator releases results.'),
    ).toBeInTheDocument();
  });

  it('carries no warning when the caller gives none', () => {
    render(
      <LabReleasePolicyToggle
        label="One person may enter and release"
        description="A second person releases what somebody else entered."
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    );

    // The safety note belongs to the loosened position only; showing it always
    // would make it wallpaper, and nobody reads wallpaper.
    expect(screen.queryByText(/removes the second pair of eyes/i)).not.toBeInTheDocument();
  });

  it('shows the warning when the caller gives one', () => {
    render(
      <LabReleasePolicyToggle
        label="One person may enter and release"
        description="The person who typed a value may also release it."
        checked
        warning="This removes the second pair of eyes on every result."
        onCheckedChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('This removes the second pair of eyes on every result.'),
    ).toBeInTheDocument();
  });

  it('reports the new position when clicked', async () => {
    const onCheckedChange = vi.fn();
    render(
      <LabReleasePolicyToggle
        label="Technicians may release results"
        description="Only a doctor or an administrator releases results."
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('cannot be changed while the panel is saving', async () => {
    const onCheckedChange = vi.fn();
    render(
      <LabReleasePolicyToggle
        label="Technicians may release results"
        description="Only a doctor or an administrator releases results."
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
