import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { ChatComposer } from './chat-composer';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

function renderComposer(props: { isBusy: boolean; onSend: (text: string) => void }) {
  return render(
    <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
      <ChatComposer {...props} />
    </NextIntlClientProvider>,
  );
}

describe('ChatComposer', () => {
  it('disables send until the draft has content', async () => {
    const user = userEvent.setup();
    renderComposer({ isBusy: false, onSend: vi.fn() });

    const sendButton = screen.getByRole('button', { name: 'Kirim pesan' });
    expect(sendButton).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' }),
      'Halo',
    );

    expect(sendButton).toBeEnabled();
  });

  it('renders attach and mic as disabled dummy controls', () => {
    renderComposer({ isBusy: false, onSend: vi.fn() });

    expect(screen.getByRole('button', { name: 'Lampirkan berkas' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rekam pesan suara' })).toBeDisabled();
  });

  it('sends the trimmed draft on Enter and clears the textarea', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderComposer({ isBusy: false, onSend });

    const textarea = screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' });
    await user.type(textarea, '  Check labs  ');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Check labs');
    expect(textarea).toHaveValue('');
  });

  it('keeps the draft on Shift+Enter and takes the new line', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderComposer({ isBusy: false, onSend });

    const textarea = screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' });
    await user.type(textarea, 'Line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(textarea, 'Line two');

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line one\nLine two');
  });

  it('starts one row tall and sizes itself to the draft', async () => {
    const user = userEvent.setup();
    renderComposer({ isBusy: false, onSend: vi.fn() });

    const textarea = screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' });
    // A composer that opens six rows tall spends the transcript's space on an
    // empty box; the height is the hook's to decide from here on.
    expect(textarea).toHaveAttribute('rows', '1');
    expect(textarea.className).not.toContain('min-h-24');

    await user.type(textarea, 'Halo');

    expect(textarea.style.height).not.toBe('');
  });

  it('disables send while a reply is in flight', async () => {
    const user = userEvent.setup();
    renderComposer({ isBusy: true, onSend: vi.fn() });

    await user.type(
      screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' }),
      'Halo',
    );

    expect(screen.getByRole('button', { name: 'Kirim pesan' })).toBeDisabled();
  });
});
