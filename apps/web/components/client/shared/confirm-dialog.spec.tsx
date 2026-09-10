import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

type Overrides = Partial<Parameters<typeof ConfirmDialog>[0]>;

function renderDialog(overrides: Overrides = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Hapus dokumen ini?"
      description="Menghapus dokumen ini tidak dapat dibatalkan."
      confirmLabel="Hapus"
      cancelLabel="Batal"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('puts the title and the reasoning in front of the reader', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Hapus dokumen ini?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Menghapus dokumen ini tidak dapat dibatalkan.'),
    ).toBeInTheDocument();
  });

  it('opens with focus on cancel, never on the destructive action', async () => {
    // An Enter pressed on reflex should do the harmless thing. This is the
    // one focus decision the component makes; the rest of the keyboard
    // behaviour is Radix's.
    renderDialog({ isDestructive: true });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Batal' })).toHaveFocus(),
    );
  });

  it('closes on cancel and on Escape without confirming', async () => {
    const { onConfirm, onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms once per click', async () => {
    const { onConfirm } = renderDialog();
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Hapus' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('marks the confirm button as destructive only when asked to', async () => {
    const { unmount } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Hapus"
        description="Tidak dapat dibatalkan."
        confirmLabel="Hapus"
        cancelLabel="Batal"
        onConfirm={vi.fn()}
        isDestructive
      />,
    );
    expect(screen.getByRole('button', { name: 'Hapus' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    unmount();

    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Hapus' })).toHaveAttribute(
      'data-variant',
      'default',
    );
  });

  it('will not close, and will not confirm twice, while the action is running', async () => {
    // A half-finished delete that loses its dialog leaves the reader with no
    // idea whether it happened, and a second click on a slow mutation is how
    // one confirmed decision becomes two requests.
    const { onConfirm, onOpenChange } = renderDialog({ isPending: true });
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Hapus' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Batal' })).toBeDisabled();

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
