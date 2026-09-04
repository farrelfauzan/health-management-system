import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminUser } from '@hms/shared-types';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUserOffboardingDialog } from './admin-user-offboarding-dialog';
import {
  userOffboardingControllerOffboardUserV1,
  userOffboardingControllerPreviewOffboardingV1,
  userOffboardingControllerReonboardUserV1,
} from '#lib/api/generated/admin-management/admin-management';
import messages from '../../../messages/en/operations.json';

vi.mock('#lib/api/generated/admin-management/admin-management', () => ({
  userOffboardingControllerPreviewOffboardingV1: vi.fn(),
  userOffboardingControllerOffboardUserV1: vi.fn(),
  userOffboardingControllerReonboardUserV1: vi.fn(),
  getUserOffboardingControllerPreviewOffboardingV1QueryKey: (id: string) => [
    `/api/v1/users/${id}/offboarding`,
  ],
}));

const previewMock = vi.mocked(userOffboardingControllerPreviewOffboardingV1);
const offboardMock = vi.mocked(userOffboardingControllerOffboardUserV1);
const reonboardMock = vi.mocked(userOffboardingControllerReonboardUserV1);

const USER: AdminUser = {
  id: 'user-1',
  email: 'dr.maya@hms.local',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  roles: [{ code: 'DOCTOR', name: 'Doctor' }],
};

const PREVIEW = {
  userId: 'user-1',
  email: 'dr.maya@hms.local',
  sharedDocumentCount: 2,
  unsharedDocumentCount: 3,
  deletionDate: '2026-10-04',
  offboardedAt: null,
};

function buildResponse(data: unknown, message?: string) {
  return { data: { data, ...(message ? { message } : {}) }, status: 200 } as never;
}

function render(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('AdminUserOffboardingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue(buildResponse(PREVIEW));
    offboardMock.mockResolvedValue(
      buildResponse({ ...PREVIEW, offboardedAt: '2026-09-04T10:00:00.000Z' }, 'User offboarded'),
    );
    reonboardMock.mockResolvedValue(buildResponse(PREVIEW, 'User re-onboarded'));
  });

  it('shows what will be deleted, what will survive, and the day, before asking', async () => {
    render(<AdminUserOffboardingDialog open onOpenChange={vi.fn()} user={USER} />);

    // FR-E3-31. The counts are the decision; "are you sure" is a button.
    expect(await screen.findByText('3 documents they have not shared')).toBeInTheDocument();
    expect(
      screen.getByText('2 shared documents, readable by the people they were shared with'),
    ).toBeInTheDocument();
    expect(screen.getByText('October 4, 2026')).toBeInTheDocument();
    expect(screen.getByText(/every session they hold ends/)).toBeInTheDocument();
  });

  it('offboards on confirm and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AdminUserOffboardingDialog open onOpenChange={onOpenChange} user={USER} />);
    await screen.findByText('October 4, 2026');

    await user.click(screen.getByRole('button', { name: 'Offboard' }));

    await waitFor(() => expect(offboardMock).toHaveBeenCalledWith('user-1'));
    expect(reonboardMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('re-onboards instead when the person is already in their window', async () => {
    const user = userEvent.setup();
    render(
      <AdminUserOffboardingDialog
        open
        onOpenChange={vi.fn()}
        user={{ ...USER, offboardedAt: '2026-09-04T10:00:00.000Z' }}
      />,
    );
    await screen.findByText('October 4, 2026');

    expect(screen.getByText('Re-onboard this user?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Re-onboard' }));

    await waitFor(() => expect(reonboardMock).toHaveBeenCalledWith('user-1'));
    expect(offboardMock).not.toHaveBeenCalled();
  });

  it('keeps the confirm disabled until the preview has loaded', () => {
    previewMock.mockReturnValue(new Promise(() => undefined));
    render(<AdminUserOffboardingDialog open onOpenChange={vi.fn()} user={USER} />);

    // A super admin must not be able to confirm a deletion whose size they
    // have not seen.
    expect(screen.getByRole('button', { name: 'Offboard' })).toBeDisabled();
    expect(screen.getByText('Counting their documents…')).toBeInTheDocument();
  });
});
