import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorScheduleDialog } from './doctor-schedule-dialog';
import { doctorManagementControllerUpdateDoctorScheduleV1 } from '#lib/api/generated/doctor-management/doctor-management';

vi.mock('#lib/api/generated/doctor-management/doctor-management', () => ({
  doctorManagementControllerUpdateDoctorScheduleV1: vi.fn(),
}));

const scheduleRequestMock = vi.mocked(doctorManagementControllerUpdateDoctorScheduleV1);

const OVERLAPPING_SCHEDULES = [
  { id: 's1', dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
  { id: 's2', dayOfWeek: 1, startTime: '11:00', endTime: '15:00', isAvailable: true },
];

const VALID_SCHEDULES = [
  { id: 's1', dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
];

function buildApiOverlapError(): AxiosError {
  return new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {},
    data: {
      error: {
        code: 'BAD_REQUEST',
        message: 'Schedule entries must not overlap on the same day',
      },
    },
  } as AxiosResponse);
}

function renderDialog(initialSchedules: typeof VALID_SCHEDULES): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <DoctorScheduleDialog
        open
        onOpenChange={vi.fn()}
        doctorId="doctor-1"
        doctorName="Dr. Budi Santoso"
        initialSchedules={initialSchedules}
      />
    </QueryClientProvider>,
  );
}

describe('DoctorScheduleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects overlapping entries client-side before calling the API', async () => {
    const user = userEvent.setup();
    renderDialog(OVERLAPPING_SCHEDULES);

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Schedule entries must not overlap on the same day',
    );
    expect(scheduleRequestMock).not.toHaveBeenCalled();
  });

  it('surfaces schedule-overlap conflicts returned by the API', async () => {
    const user = userEvent.setup();
    scheduleRequestMock.mockRejectedValue(buildApiOverlapError());
    renderDialog(VALID_SCHEDULES);

    await user.click(screen.getByRole('button', { name: 'Save Schedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Schedule entries must not overlap on the same day',
    );
    expect(scheduleRequestMock).toHaveBeenCalledWith('doctor-1', {
      schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
    });
  });
});
