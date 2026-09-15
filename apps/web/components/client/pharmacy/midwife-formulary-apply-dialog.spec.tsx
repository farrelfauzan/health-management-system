import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MidwifeFormularyApplyDialog } from './midwife-formulary-apply-dialog';
import {
  medicationControllerApplyMidwifeFormularyV1,
  medicationControllerPreviewMidwifeFormularyV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import pharmacyMessages from '../../../messages/en/pharmacy-inventory.json';
import sharedMessages from '../../../messages/en/shared.json';

vi.mock('#lib/api/generated/pharmacy-flow/pharmacy-flow', () => ({
  medicationControllerPreviewMidwifeFormularyV1: vi.fn(),
  medicationControllerApplyMidwifeFormularyV1: vi.fn(),
  getMedicationControllerPreviewMidwifeFormularyV1QueryKey: (): unknown[] => [
    '/api/v1/medications/midwife-formulary/preview',
  ],
}));

const previewMock = vi.mocked(medicationControllerPreviewMidwifeFormularyV1);
const applyMock = vi.mocked(medicationControllerApplyMidwifeFormularyV1);

const IRON_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_IRON_ID = '22222222-2222-4222-8222-222222222222';
const KEYWORD_ID = '33333333-3333-4333-8333-333333333333';
const FLAGGED_ID = '44444444-4444-4444-8444-444444444444';

const ironItem = {
  id: 'item-iron',
  code: 'FE_PREGNANCY',
  displayName: 'Tablet tambah darah untuk ibu hamil',
  group: 'OWN_AUTHORITY',
  regulationBasis: 'Permenkes 28/2017 Pasal 19 ayat (3) huruf e',
  kfaCodes: ['93015491'],
  kfaTemplateCodes: ['92000653'],
  matchKeywords: ['ferrous'],
  sortOrder: 10,
};

function buildPreviewResponse() {
  return {
    status: 200,
    data: {
      data: {
        items: [
          {
            item: ironItem,
            matches: [
              {
                medicationId: IRON_ID,
                name: 'Tablet Tambah Darah',
                kfaCode: '93015491',
                isMidwifePrescribable: false,
                matchedBy: 'KFA_CODE',
              },
              {
                medicationId: OTHER_IRON_ID,
                name: 'Fe Folat',
                kfaCode: '93027609',
                isMidwifePrescribable: false,
                matchedBy: 'KFA_TEMPLATE',
              },
              {
                medicationId: KEYWORD_ID,
                name: 'Ferrous sirup',
                kfaCode: null,
                isMidwifePrescribable: false,
                matchedBy: 'KEYWORD',
              },
              {
                medicationId: FLAGGED_ID,
                name: 'Hemafort',
                kfaCode: '93024087',
                isMidwifePrescribable: true,
                matchedBy: 'KFA_CODE',
              },
            ],
          },
        ],
        unmatchedItems: [
          {
            ...ironItem,
            id: 'item-vitk',
            code: 'VIT_K1_NEWBORN',
            displayName: 'Vitamin K1 injeksi untuk bayi baru lahir',
          },
        ],
        templateLookup: 'COMPLETED',
      },
    },
  };
}

function render(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return testingRender(
    <NextIntlClientProvider locale="en" messages={{ ...pharmacyMessages, ...sharedMessages }}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('MidwifeFormularyApplyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue(buildPreviewResponse() as never);
  });

  it('pre-checks code and template matches and leaves a keyword suggestion unchecked', async () => {
    render(<MidwifeFormularyApplyDialog open onOpenChange={vi.fn()} />);

    const ironCheckbox = await screen.findByRole('checkbox', { name: 'Tablet Tambah Darah' });
    expect(ironCheckbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fe Folat' })).toBeChecked();
    const keywordCheckbox = screen.getByRole('checkbox', { name: 'Ferrous sirup' });
    expect(keywordCheckbox).not.toBeChecked();
    expect(keywordCheckbox).toBeDisabled();
    expect(screen.getByText('Vitamin K1 injeksi untuk bayi baru lahir')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add this medication to the catalog, fill in its KFA code, then apply again.',
      ),
    ).toBeInTheDocument();
  });

  it('disables an already-flagged row and marks it', async () => {
    render(<MidwifeFormularyApplyDialog open onOpenChange={vi.fn()} />);

    const flaggedCheckbox = await screen.findByRole('checkbox', { name: 'Hemafort' });
    expect(flaggedCheckbox).toBeDisabled();
    expect(flaggedCheckbox).not.toBeChecked();
    expect(screen.getByText('Already marked')).toBeInTheDocument();
  });

  it('applies only the checked, unflagged rows and closes', async () => {
    applyMock.mockResolvedValue({
      status: 200,
      data: {
        data: {
          flaggedCount: 1,
          alreadyFlaggedCount: 0,
          items: [{ medicationId: IRON_ID, outcome: 'FLAGGED' }],
        },
      },
    } as never);
    const onOpenChange = vi.fn();
    render(<MidwifeFormularyApplyDialog open onOpenChange={onOpenChange} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Fe Folat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark 1 medication' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(applyMock.mock.calls[0]?.[0]).toEqual({ medicationIds: [IRON_ID] });
  });
});
