import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/id/operations.json';

vi.mock('#lib/api/generated/rbac/rbac', () => ({
  rbacControllerCreateRoleV1: vi.fn(),
  rbacControllerUpdateRoleV1: vi.fn(),
  getRbacControllerGetRolesV1QueryKey: () => ['/api/v1/rbac/roles'],
}));

const { RoleFormDialog } = await import('./role-form-dialog');

function renderCreateDialog(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <RoleFormDialog open onOpenChange={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function pickTemplate(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('combobox', { name: 'Mulai dari' }));
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('RoleFormDialog — "Mulai dari" template', () => {
  it('fills name, code and description from the chosen template', async () => {
    const user = userEvent.setup();
    renderCreateDialog();

    await pickTemplate(user, 'Perawat depan');

    expect(screen.getByLabelText('Nama')).toHaveValue('Perawat depan');
    expect(screen.getByLabelText('Kode')).toHaveValue('FRONT_NURSE');
    expect(screen.getByLabelText('Deskripsi')).toHaveValue(
      messages.operations.administration.roles.templates.items.FRONT_NURSE.description,
    );
  });

  it('follows the select when the template is changed again', async () => {
    const user = userEvent.setup();
    renderCreateDialog();

    await pickTemplate(user, 'Perawat depan');
    await pickTemplate(user, 'Kasir');

    expect(screen.getByLabelText('Nama')).toHaveValue('Kasir');
    expect(screen.getByLabelText('Kode')).toHaveValue('CASHIER');
  });

  it('clears what the template filled when switching back to blank', async () => {
    const user = userEvent.setup();
    renderCreateDialog();

    await pickTemplate(user, 'Kasir');
    await pickTemplate(user, 'Kosong');

    expect(screen.getByLabelText('Nama')).toHaveValue('');
    expect(screen.getByLabelText('Kode')).toHaveValue('');
  });

  it('keeps a name the admin typed themselves', async () => {
    const user = userEvent.setup();
    renderCreateDialog();

    await pickTemplate(user, 'Perawat depan');
    await user.clear(screen.getByLabelText('Nama'));
    await user.type(screen.getByLabelText('Nama'), 'Perawat Triase Pagi');
    await pickTemplate(user, 'Kasir');

    expect(screen.getByLabelText('Nama')).toHaveValue('Perawat Triase Pagi');
    expect(screen.getByLabelText('Kode')).toHaveValue('CASHIER');
  });
});
