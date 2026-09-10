import type { RoomClassResponse, WardResponse } from '@hms/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RoomFormDialog } from './room-form-dialog';
import {
  roomClassControllerListRoomClassesV1,
  wardControllerListWardsV1,
} from '#lib/api/generated/room-management/room-management';
import operations from '../../../messages/en/operations.json';
import shared from '../../../messages/en/shared.json';

vi.mock('#lib/api/generated/room-management/room-management', () => ({
  roomControllerCreateRoomV1: vi.fn(),
  roomControllerUpdateRoomV1: vi.fn(),
  wardControllerListWardsV1: vi.fn(),
  getWardControllerListWardsV1QueryKey: (params?: unknown) => ['wards', params],
  roomClassControllerListRoomClassesV1: vi.fn(),
  getRoomClassControllerListRoomClassesV1QueryKey: (params?: unknown) => ['room-classes', params],
}));

const messages = { ...operations, ...shared };
const wardsRequestMock = vi.mocked(wardControllerListWardsV1);
const roomClassesRequestMock = vi.mocked(roomClassControllerListRoomClassesV1);

const WARD: WardResponse = {
  id: 'ward-1',
  code: 'MELATI',
  name: 'Bangsal Melati',
  isActive: true,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

const ROOM_CLASS: RoomClassResponse = {
  id: 'class-1',
  code: 'KELAS_1',
  name: 'Kelas 1',
  allocatedBeds: 0,
  isActive: true,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

type WardsListResponse = Awaited<ReturnType<typeof wardControllerListWardsV1>>;
type RoomClassesListResponse = Awaited<ReturnType<typeof roomClassControllerListRoomClassesV1>>;

function buildListResponse<TResponse extends WardsListResponse | RoomClassesListResponse>(
  items: WardResponse[] | RoomClassResponse[],
): TResponse {
  return {
    status: 200,
    data: { data: items, meta: { page: 1, limit: 100, total: items.length } },
  } as unknown as TResponse;
}

function renderDialog(props: { onGoToWards?: () => void; onOpenChange?: (open: boolean) => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>
        <RoomFormDialog
          open
          room={null}
          onOpenChange={props.onOpenChange ?? vi.fn()}
          onGoToWards={props.onGoToWards}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('RoomFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roomClassesRequestMock.mockResolvedValue(buildListResponse([ROOM_CLASS]));
  });

  it('says there are no wards, offers the way there, and blocks Save', async () => {
    // A fresh clinic has no ward to put a room in. The dialog says so where
    // the picker would be, rather than letting the form fail on submit.
    const user = userEvent.setup();
    const onGoToWards = vi.fn();
    const onOpenChange = vi.fn();
    wardsRequestMock.mockResolvedValue(buildListResponse([]));

    renderDialog({ onGoToWards, onOpenChange });

    expect(await screen.findByText(operations.operations.rooms.noWards)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Ward/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Go to Wards' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onGoToWards).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton while wards load, not a disabled picker', () => {
    // A disabled select reads as "you may not"; a skeleton reads as "wait".
    wardsRequestMock.mockReturnValue(new Promise(() => undefined));

    renderDialog({});

    expect(screen.getByTestId('room-ward-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Ward/ })).not.toBeInTheDocument();
    expect(screen.queryByText(operations.operations.rooms.noWards)).not.toBeInTheDocument();
  });

  it('offers the wards under a "select" placeholder once there are some', async () => {
    wardsRequestMock.mockResolvedValue(buildListResponse([WARD]));

    renderDialog({});

    expect(await screen.findByRole('combobox', { name: /^Ward/ })).toHaveTextContent(
      'Select a ward',
    );
    expect(screen.queryByText(operations.operations.rooms.noWards)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
