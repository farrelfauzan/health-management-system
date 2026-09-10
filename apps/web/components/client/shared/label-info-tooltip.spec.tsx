import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LabelInfoTooltip } from './label-info-tooltip';
import enMessages from '../../../messages/en/shared.json';
import idMessages from '../../../messages/id/shared.json';

function renderTooltip(locale: 'en' | 'id') {
  const messages = locale === 'en' ? enMessages : idMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LabelInfoTooltip field="KFA code">Kemenkes product code</LabelInfoTooltip>
    </NextIntlClientProvider>,
  );
}

describe('LabelInfoTooltip', () => {
  it('renders a focusable trigger named after the field', () => {
    renderTooltip('en');

    const trigger = screen.getByRole('button', { name: 'More about KFA code' });
    trigger.focus();

    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveFocus();
  });

  it('opens on keyboard focus', async () => {
    renderTooltip('en');

    screen.getByRole('button', { name: 'More about KFA code' }).focus();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Kemenkes product code');
  });

  it('opens on hover', async () => {
    const user = userEvent.setup();
    renderTooltip('en');

    await user.hover(screen.getByRole('button', { name: 'More about KFA code' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Kemenkes product code');
  });

  it('translates the trigger name for the Indonesian locale', () => {
    renderTooltip('id');

    expect(screen.getByRole('button', { name: 'Selengkapnya tentang KFA code' })).toBeInTheDocument();
  });
});
