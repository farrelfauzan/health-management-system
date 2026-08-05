import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { ToolResultCard } from './tool-result-card';
import { getDashboardAiMessages } from '#lib/dashboard/localization';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

function renderCard(toolResult: ParsedToolResult) {
  return render(
    <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
      <ToolResultCard toolResult={toolResult} />
    </NextIntlClientProvider>,
  );
}

describe('ToolResultCard', () => {
  it('renders a stock lookup as a table naming what was searched', () => {
    renderCard({
      kind: 'STOCK',
      result: {
        medicationName: 'amoxicillin',
        matchCount: 1,
        items: [
          {
            medicationCode: 'MED-AMOX-500',
            medicationName: 'Amoxicillin',
            form: 'Kapsul',
            strength: '500 mg',
            unit: 'KAPSUL',
            stockQty: 35,
            reorderLevel: 40,
            needsReorder: true,
          },
        ],
      },
    });

    expect(screen.getByText('Stok obat')).toBeInTheDocument();
    // Naming the argument is what makes a wrong tool choice visible (§4.7).
    expect(screen.getByText('Pencarian: amoxicillin')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('Perlu dipesan ulang')).toBeInTheDocument();
    expect(
      screen.getByText('Diambil langsung dari data HMS, bukan dari jawaban asisten.'),
    ).toBeInTheDocument();
  });

  it('says how many rows were withheld when the page cap bit', () => {
    renderCard({
      kind: 'STOCK',
      result: {
        medicationName: null,
        matchCount: 44,
        items: [
          {
            medicationCode: 'MED-1',
            medicationName: 'Paracetamol',
            stockQty: 10,
            reorderLevel: 5,
            needsReorder: false,
          },
        ],
      },
    });

    expect(screen.getByText('Menampilkan 1 dari 44 hasil')).toBeInTheDocument();
    expect(screen.getByText('Seluruh katalog obat')).toBeInTheDocument();
  });

  it('renders an empty lookup as empty rather than as an answer', () => {
    renderCard({
      kind: 'STOCK',
      result: { medicationName: 'ranitidine', matchCount: 0, items: [] },
    });

    expect(screen.getByText('Tidak ada data yang cocok.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a failed lookup as failed, with its typed code', () => {
    renderCard({ kind: 'FAILED', toolName: 'check_medication_expiry', errorCode: 'AI_TOOL_UNAVAILABLE' });

    expect(screen.getByText('Pencarian ini tidak dapat dijalankan.')).toBeInTheDocument();
    expect(screen.getByText('Kode: AI_TOOL_UNAVAILABLE')).toBeInTheDocument();
    // Headed by the lookup's readable name, never by its wire name.
    expect(screen.getByText('Obat kedaluwarsa')).toBeInTheDocument();
    expect(screen.queryByText('check_medication_expiry')).not.toBeInTheDocument();
  });

  it('answers the queue question in words before the per-poli table', () => {
    renderCard({
      kind: 'QUEUE',
      result: {
        date: '2026-08-04',
        waiting: 7,
        pending: 2,
        checkedIn: 3,
        completed: 11,
        cancelled: 1,
        poli: [
          {
            poliName: 'Poli Umum',
            waiting: 5,
            pending: 1,
            checkedIn: 2,
            completed: 8,
            cancelled: 1,
          },
        ],
      },
    });

    // Mode A forbids the reply text from stating the numbers, so if the card
    // does not say it in words, nothing does.
    expect(
      screen.getByText('12 pasien dalam antrean (7 menunggu) · 11 selesai'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tanggal 2026-08-04')).toBeInTheDocument();
    expect(screen.getByText('Poli Umum')).toBeInTheDocument();
  });

  it('renders the cashier report as money, split by method and doctor', () => {
    renderCard({
      kind: 'CASHIER',
      result: {
        date: '2026-08-04',
        paymentCount: 12,
        totalAmount: 1_850_000,
        byMethod: [{ method: 'CASH', count: 9, totalAmount: 1_250_000 }],
        byDoctor: [{ doctorName: 'dr. Siti', count: 6, totalAmount: 900_000 }],
      },
    });

    expect(screen.getByText('Kas harian')).toBeInTheDocument();
    expect(screen.getByText(/dari 12 pembayaran lunas/)).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText('dr. Siti')).toBeInTheDocument();
  });

  it('says a session is uncapped rather than rendering it as full', () => {
    renderCard({
      kind: 'APPOINTMENT_LOAD',
      result: {
        from: '2026-08-04',
        to: '2026-08-10',
        sessionCount: 1,
        totalBooked: 9,
        items: [
          {
            sessionDate: '2026-08-04',
            startTime: '08:00',
            endTime: '12:00',
            doctorName: 'dr. Siti',
            status: 'OPEN',
            maxPatients: null,
            bookedCount: 9,
            remaining: null,
          },
        ],
      },
    });

    expect(screen.getByText('9 janji temu pada 1 sesi praktik')).toBeInTheDocument();
    expect(screen.getByText('2026-08-04 s.d. 2026-08-10')).toBeInTheDocument();
    // A session with no ceiling is not a session with no room.
    expect(screen.getAllByText('Tanpa batas')).toHaveLength(2);
  });

  it('renders a cashier day with no settled payment as exactly that', () => {
    renderCard({
      kind: 'CASHIER',
      result: {
        date: '2026-08-04',
        paymentCount: 0,
        totalAmount: 0,
        byMethod: [],
        byDoctor: [],
      },
    });

    expect(screen.getByText('Belum ada pembayaran lunas pada 2026-08-04.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an expiry lookup with counts taken over the whole report', () => {
    renderCard({
      kind: 'EXPIRY',
      result: {
        asOfDate: '2026-08-02',
        throughDate: '2026-09-01',
        expiredCount: 1,
        expiringCount: 22,
        unknownExpiryCount: 1,
        matchCount: 24,
        items: [
          {
            medicationCode: 'MED-AMOX-500',
            medicationName: 'Amoxicillin',
            batchNumber: 'BATCH-A1',
            expiryDate: '2026-08-20',
            remainingQty: 60,
            expiryStatus: 'EXPIRING',
            daysUntilExpiry: 18,
          },
        ],
      },
    });

    expect(screen.getByText('Hingga 2026-09-01')).toBeInTheDocument();
    expect(
      screen.getByText('1 kedaluwarsa · 22 segera kedaluwarsa · 1 tanpa tanggal'),
    ).toBeInTheDocument();
    expect(screen.getByText('BATCH-A1')).toBeInTheDocument();
    expect(screen.getByText('Segera kedaluwarsa')).toBeInTheDocument();
  });
});
