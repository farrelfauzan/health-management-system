import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationView } from '@hms/shared-types';
import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';

import { NotificationsMenu } from './notifications-menu';
import {
  notificationControllerGetUnreadCountV1,
  notificationControllerListNotificationsV1,
  notificationControllerMarkAllAsReadV1,
} from '#lib/api/generated/notifications/notifications';
import messages from '../../../messages/id/auth-shell.json';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('#lib/api/generated/notifications/notifications', () => ({
  notificationControllerListNotificationsV1: vi.fn(),
  getNotificationControllerListNotificationsV1QueryKey: (params?: unknown) => [
    'notifications',
    params,
  ],
  notificationControllerGetUnreadCountV1: vi.fn(),
  getNotificationControllerGetUnreadCountV1QueryKey: () => ['notifications-unread-count'],
  notificationControllerMarkAllAsReadV1: vi.fn(),
}));

const listRequestMock = vi.mocked(notificationControllerListNotificationsV1);
const unreadCountRequestMock = vi.mocked(notificationControllerGetUnreadCountV1);
const markAllReadRequestMock = vi.mocked(notificationControllerMarkAllAsReadV1);

const FULL_RULES: AppRule[] = [
  { action: 'read', subject: 'Notification' },
  { action: 'manage', subject: 'Notification' },
];

const NOTIFICATION_ROW: NotificationView = {
  id: 'notification-1',
  type: 'APPOINTMENT_APPROVED',
  titleKey: 'appointmentApproved.title',
  bodyKey: 'appointmentApproved.body',
  params: { doctorName: 'dr. Ratna Dewi, Sp.PD' },
  href: null,
  readAt: null,
  createdAt: '2026-08-26T09:55:00.000Z',
};

const DOCUMENT_APPROVAL_ROW: NotificationView = {
  id: 'notification-2',
  type: 'DOCUMENT_APPROVAL_REQUESTED',
  titleKey: 'documentApprovalRequested.title',
  bodyKey: 'documentApprovalRequested.body',
  params: {
    documentTitle: 'SOP Sterilisasi Alat',
    documentTypeName: 'SOP',
    drafterEmail: 'drafter@klinik.test',
    dueAt: '2026-08-30T09:00:00.000Z',
  },
  href: '/admin/documents/document-1',
  readAt: null,
  createdAt: '2026-08-26T09:58:00.000Z',
};

function mockResponses({
  unreadCount,
  rows = [NOTIFICATION_ROW],
}: {
  unreadCount: number;
  rows?: readonly NotificationView[];
}): void {
  unreadCountRequestMock.mockResolvedValue({
    status: 200,
    data: { data: { unreadCount } },
  } as never);
  listRequestMock.mockResolvedValue({
    status: 200,
    data: { data: rows, meta: { page: 1, limit: 10, total: rows.length } },
  } as never);
  markAllReadRequestMock.mockResolvedValue({
    status: 200,
    data: { data: { updatedCount: unreadCount }, message: 'ok' },
  } as never);
}

function renderMenu(rules: AppRule[]): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider ability={buildAppAbility(rules)}>
        <NextIntlClientProvider
          locale="id"
          messages={messages}
          timeZone="Asia/Jakarta"
          now={new Date('2026-08-26T10:00:00.000Z')}
        >
          <NotificationsMenu />
        </NextIntlClientProvider>
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe('NotificationsMenu', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unread dot from the count endpoint and lists rows on open', async () => {
    const user = userEvent.setup();
    mockResponses({ unreadCount: 1 });
    renderMenu(FULL_RULES);

    const trigger = await screen.findByRole('button', { name: 'Buka notifikasi' });
    expect(listRequestMock).not.toHaveBeenCalled();
    await user.click(trigger);

    expect(await screen.findByText('Janji temu disetujui')).toBeInTheDocument();
    expect(
      screen.getByText('Permintaan janji temu Anda dengan dr. Ratna Dewi, Sp.PD telah disetujui.'),
    ).toBeInTheDocument();
  });

  it('translates document approval rows instead of showing their raw keys', async () => {
    const user = userEvent.setup();
    mockResponses({ unreadCount: 1, rows: [DOCUMENT_APPROVAL_ROW] });
    renderMenu(FULL_RULES);

    await user.click(await screen.findByRole('button', { name: 'Buka notifikasi' }));

    expect(await screen.findByText('Permintaan persetujuan dokumen')).toBeInTheDocument();
    expect(
      screen.getByText('drafter@klinik.test meminta persetujuan Anda atas “SOP Sterilisasi Alat”.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('documentApprovalRequested.title')).not.toBeInTheDocument();
  });

  it('marks everything read when the menu opens with unread rows', async () => {
    const user = userEvent.setup();
    mockResponses({ unreadCount: 2 });
    renderMenu(FULL_RULES);

    await user.click(await screen.findByRole('button', { name: 'Buka notifikasi' }));

    expect(markAllReadRequestMock).toHaveBeenCalledTimes(1);
  });

  it('never calls read-all without the manage ability', async () => {
    const user = userEvent.setup();
    mockResponses({ unreadCount: 2 });
    renderMenu([{ action: 'read', subject: 'Notification' }]);

    await user.click(await screen.findByRole('button', { name: 'Buka notifikasi' }));
    await screen.findByText('Janji temu disetujui');

    expect(markAllReadRequestMock).not.toHaveBeenCalled();
  });

  it('renders nothing and requests nothing without the read ability', () => {
    renderMenu([]);

    expect(screen.queryByRole('button', { name: 'Buka notifikasi' })).not.toBeInTheDocument();
    expect(unreadCountRequestMock).not.toHaveBeenCalled();
    expect(listRequestMock).not.toHaveBeenCalled();
  });
});
