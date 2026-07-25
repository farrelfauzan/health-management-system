import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatComposer } from './chat-composer';

describe('ChatComposer', () => {
  it('disables send until the draft has content', async () => {
    const user = userEvent.setup();
    render(<ChatComposer isBusy={false} onSend={vi.fn()} />);

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Message the AI Clinical Assistant' }), 'Hello');

    expect(sendButton).toBeEnabled();
  });

  it('renders attach and mic as disabled dummy controls', () => {
    render(<ChatComposer isBusy={false} onSend={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Attach file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeDisabled();
  });

  it('sends the trimmed draft on Enter and clears the textarea', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer isBusy={false} onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: 'Message the AI Clinical Assistant' });
    await user.type(textarea, '  Check labs  ');
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Check labs');
    expect(textarea).toHaveValue('');
  });

  it('keeps the draft on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer isBusy={false} onSend={onSend} />);

    const textarea = screen.getByRole('textbox', { name: 'Message the AI Clinical Assistant' });
    await user.type(textarea, 'Line one');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables send while a reply is in flight', async () => {
    const user = userEvent.setup();
    render(<ChatComposer isBusy onSend={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: 'Message the AI Clinical Assistant' }), 'Hello');

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
