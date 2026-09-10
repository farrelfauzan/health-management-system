import type { RoomResponse } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BedFormDialog } from './bed-form-dialog';
import { roomControllerListRoomsV1 } from '#lib/api/generated/room-management/room-management';
import operations from '../../../messages/en/operations.json';
import shared from '../../../messages/en/shared.json';

vi.mock('#lib/api/generated/room-management/room-management', () => ({
  bedControllerCreateBedV1: vi.fn(),
  bedControllerUpdateBedV1: vi.fn(),
  roomControllerListRoomsV1: vi.fn(),
  getRoomControllerListRoomsV1QueryKey: (params?: unknown) => ['rooms', params],
}));

const messages = { ...operations, ...shared };
const roomsRequestMock = vi.mocked(roomControllerListRoomsV1);

const ROOM: RoomResponse = {
  id: 'room-1',
  wardId: 'ward-1',
  ward: { id: 'ward-1', code: 'MELATI', name: 'Bangsal Melati' },
  roomClassId: 'class-1',
  roomClass: { id: 'class-1', code: 'KELAS_1', name: 'Kelas 1' },
  code: '201',
  name: 'Kamar 201',
  isActive: true,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

function buildListResponse(
  items: RoomResponse[],
): Awaited<ReturnType<typeof roomControllerListRoomsV1>> {
  return {
    status: 200,
    data: { data: items, meta: { page: 1, limit: 100, total: items.length } },
  } as unknown as Awaited<ReturnType<typeof roomControllerListRoomsV1>>;
}

function renderDialog(props: { onGoToRooms?: () => void; onOpenChange?: (open: boolean) => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <BedFormDialog
          open
          bed={null}
          onOpenChange={props.onOpenChange ?? vi.fn()}
          onGoToRooms={props.onGoToRooms}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('BedFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says there are no rooms, offers the way there, and blocks Save', async () => {
    const user = userEvent.setup();
    const onGoToRooms = vi.fn();
    const onOpenChange = vi.fn();
    roomsRequestMock.mockResolvedValue(buildListResponse([]));

    renderDialog({ onGoToRooms, onOpenChange });

    expect(await screen.findByText(operations.operations.rooms.noRooms)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Room/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Go to Rooms' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onGoToRooms).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton while rooms load, not a disabled picker', () => {
    roomsRequestMock.mockReturnValue(new Promise(() => undefined));

    renderDialog({});

    expect(screen.getByTestId('bed-room-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Room/ })).not.toBeInTheDocument();
  });

  it('offers the rooms under a "select" placeholder once there are some', async () => {
    roomsRequestMock.mockResolvedValue(buildListResponse([ROOM]));

    renderDialog({});

    expect(await screen.findByRole('combobox', { name: /^Room/ })).toHaveTextContent(
      'Select a room',
    );
    expect(screen.queryByText(operations.operations.rooms.noRooms)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
