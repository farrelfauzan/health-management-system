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
