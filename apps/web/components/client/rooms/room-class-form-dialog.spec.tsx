import type { RoomClassResponse } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import operationsMessages from '../../../messages/en/operations.json';
import sharedMessages from '../../../messages/en/shared.json';

const messages = { ...operationsMessages, ...sharedMessages };

const { createMock, updateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('#lib/api/generated/room-management/room-management', () => ({
  roomClassControllerCreateRoomClassV1: (payload: unknown) => createMock(payload),
  roomClassControllerUpdateRoomClassV1: (id: string, payload: unknown) => updateMock(id, payload),
}));

vi.mock('#lib/rooms/invalidate-room-queries', () => ({
  invalidateRoomQueries: vi.fn(),
}));

const { RoomClassFormDialog } = await import('./room-class-form-dialog');

function buildRoomClass(overrides: Partial<RoomClassResponse> = {}): RoomClassResponse {
  return {
    id: 'room-class-1',
    code: 'KELAS-1',
    name: 'Kelas 1',
    allocatedBeds: 0,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(roomClass: RoomClassResponse | null): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
        <RoomClassFormDialog open onOpenChange={vi.fn()} roomClass={roomClass} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const SAVE_LABEL = messages.operations.rooms.save;

describe('RoomClassFormDialog SATUSEHAT service class (P24-T05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ status: 201, data: { data: buildRoomClass() } });
    updateMock.mockResolvedValue({ status: 200, data: { data: buildRoomClass() } });
  });

  it('keeps a mapped class when an edit saves', async () => {
    const user = userEvent.setup();
    renderDialog(buildRoomClass({ satusehatServiceClass: 'VIP' }));

    expect(document.querySelector('[data-slot="select-value"]')).toHaveTextContent(
      messages.operations.rooms.serviceClasses.VIP,
    );
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][1]).toMatchObject({ satusehatServiceClass: 'VIP' });
  });

  it('sends null for an unmapped class on an edit, which is how the mapping is cleared', async () => {
    const user = userEvent.setup();
    renderDialog(buildRoomClass());

    expect(document.querySelector('[data-slot="select-value"]')).toHaveTextContent(
      messages.operations.rooms.serviceClassUnmapped,
    );
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][1]).toMatchObject({ satusehatServiceClass: null });
  });

  it('leaves the class out of a create that maps nothing', async () => {
    const user = userEvent.setup();
    renderDialog(null);

    await user.type(document.getElementById('room-class-code') as HTMLElement, 'KELAS-2');
    await user.type(document.getElementById('room-class-name') as HTMLElement, 'Kelas 2');
    await user.click(screen.getByRole('button', { name: SAVE_LABEL }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('satusehatServiceClass');
  });
});
