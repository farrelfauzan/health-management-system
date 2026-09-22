import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MaternalVisitsDueCard } from './maternal-visits-due-card';
import { maternalVisitDueControllerListDueV1 } from '#lib/api/generated/maternal-care/maternal-care';
import messages from '../../../messages/id/maternal-care.json';

vi.mock('#lib/api/generated/maternal-care/maternal-care', () => ({
  maternalVisitDueControllerListDueV1: vi.fn(),
  getMaternalVisitDueControllerListDueV1QueryKey: () => ['/api/v1/maternal-visits/due'],
}));

const listRequestMock = vi.mocked(maternalVisitDueControllerListDueV1);

const BASE_ITEM = {
  subject: 'PATIENT',
  medicalRecordNumber: 'RM-1',
  hasReminderConsent: true,
  reminder: null,
};

describe('MaternalVisitsDueCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists each due visit with its schedule, window and reminder state', async () => {
    listRequestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        data: {
          from: '2026-10-01',
          to: '2026-10-07',
          items: [
            {
              ...BASE_ITEM,
              visitKey: 'PNC:e1:KF2',
              source: 'POSTNATAL',
              code: 'KF2',
              patientId: 'p-rina',
              patientName: 'Ibu Rina',
              dueFrom: '2026-10-02',
              dueUntil: '2026-10-06',
              reminder: { status: 'SENT', attemptedAt: '2026-10-01T02:00:00.000Z' },
            },
            {
              ...BASE_ITEM,
              visitKey: 'KB:k1:2026-10-03',
              source: 'FAMILY_PLANNING',
              code: 'INJECTABLE_3_MONTH',
              patientId: 'p-sari',
              patientName: 'Ibu Sari',
              dueFrom: '2026-10-03',
              dueUntil: '2026-10-03',
              hasReminderConsent: false,
            },
          ],
        },
      },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <QueryClientProvider client={queryClient}>
          <MaternalVisitsDueCard patientBasePath="/doctor/patients" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    expect(await screen.findByText('Ibu Rina')).toBeInTheDocument();
    expect(screen.getByText('Jatuh tempo minggu ini')).toBeInTheDocument();
    expect(screen.getByText('Nifas · KF2')).toBeInTheDocument();
    expect(screen.getByText('2026-10-02 – 2026-10-06')).toBeInTheDocument();
    expect(screen.getByText('Pengingat terkirim')).toBeInTheDocument();
    expect(screen.getByText('Tanpa persetujuan pengingat')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ibu Sari/ })).toHaveAttribute(
      'href',
      '/doctor/patients/p-sari?tab=family-planning',
    );
  });
});
