import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineNotice } from './inline-notice';

describe('InlineNotice', () => {
  it('announces an error and renders the message bold in the destructive colour', () => {
    render(<InlineNotice tone="error">Check-in is outside the session</InlineNotice>);

    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'error');
    expect(screen.getByText('Check-in is outside the session')).toHaveClass(
      'font-semibold',
      'text-destructive',
    );
  });

  it('puts the emphasis on the title and keeps the body regular when both are given', () => {
    render(
      <InlineNotice tone="warning" title="Licence expired">
        Booking proceeds without the scan.
      </InlineNotice>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Licence expired')).toHaveClass(
      'font-semibold',
      'text-warning-emphasis',
    );
    const actualBody = screen.getByText('Booking proceeds without the scan.');
    expect(actualBody).toHaveClass('text-foreground');
    expect(actualBody).not.toHaveClass('font-semibold');
  });

  it.each(['success', 'info'] as const)(
    'renders %s as a polite status without bold text',
    (inputTone) => {
      render(
        <InlineNotice tone={inputTone} data-testid="notice">
          Saved
        </InlineNotice>,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('data-testid', 'notice');
      expect(screen.getByText('Saved')).not.toHaveClass('font-semibold');
    },
  );

  it('merges extra classes onto the container', () => {
    render(
      <InlineNotice tone="error" className="mx-6">
        Failed
      </InlineNotice>,
    );

    expect(screen.getByRole('alert')).toHaveClass('mx-6', 'rounded-lg');
  });
});
