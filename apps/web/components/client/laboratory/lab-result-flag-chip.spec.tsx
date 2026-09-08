import type { LabResultFlagValue } from '@hms/shared-types';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LabResultFlagChip } from './lab-result-flag-chip';
import messages from '../../../messages/id/clinical.json';

function renderChip(flag?: LabResultFlagValue): void {
  render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
      <LabResultFlagChip flag={flag} />
    </NextIntlClientProvider>,
  );
}

describe('LabResultFlagChip', () => {
  it.each([
    ['LOW' as const, 'L'],
    ['HIGH' as const, 'H'],
    ['CRITICAL_LOW' as const, 'L!'],
    ['CRITICAL_HIGH' as const, 'H!'],
    ['ABNORMAL' as const, 'A'],
    ['NORMAL' as const, 'N'],
  ])('renders %s as %s', (inputFlag, expectedText) => {
    renderChip(inputFlag);

    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  // A critical value must not be one glyph away from one that merely leans
  // high: the pair carries its own mark and its own words on hover.
  it('marks a critical value apart from an ordinary high one', () => {
    renderChip('CRITICAL_HIGH');

    expect(screen.getByTitle('Kritis tinggi')).toBeInTheDocument();
  });

  // An empty badge beside "tidak ada rentang rujukan" would read as a
  // judgement nobody made.
  it('renders nothing when no band applied to the patient', () => {
    const { container } = render(
      <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Jakarta">
        <LabResultFlagChip />
      </NextIntlClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
