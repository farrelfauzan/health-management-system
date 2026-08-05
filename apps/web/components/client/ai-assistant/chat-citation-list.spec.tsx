import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { getDashboardAiMessages } from '#lib/dashboard/localization';

import { ChatCitationList } from './chat-citation-list';

type Citation = {
  reference: number;
  documentId: string;
  title: string;
  language: 'ID' | 'EN';
  sourceTier: 'CLINIC' | 'PERSONAL';
};

const CLINIC_CITATION: Citation = {
  reference: 1,
  documentId: 'doc-clinic',
  title: 'SOP Alur Pendaftaran Pasien BPJS',
  language: 'ID',
  sourceTier: 'CLINIC',
};

const PERSONAL_CITATION: Citation = {
  reference: 2,
  documentId: 'doc-personal',
  title: 'Panduan Tatalaksana Hipertensi 2026',
  language: 'ID',
  sourceTier: 'PERSONAL',
};

function renderList(citations: Citation[]): void {
  render(
    <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
      <ChatCitationList citations={citations as never} />
    </NextIntlClientProvider>,
  );
}

describe('ChatCitationList', () => {
  it('labels a clinic-grounded citation as a clinic document', () => {
    renderList([CLINIC_CITATION]);

    expect(screen.getByText('dari dokumen klinik')).toBeInTheDocument();
    expect(screen.queryByText('dari dokumen Anda')).not.toBeInTheDocument();
  });

  it('labels a personal-grounded citation as the reader’s own document', () => {
    renderList([PERSONAL_CITATION]);

    expect(screen.getByText('dari dokumen Anda')).toBeInTheDocument();
    expect(screen.queryByText('dari dokumen klinik')).not.toBeInTheDocument();
  });

  it('labels each citation individually in a mixed answer', () => {
    renderList([CLINIC_CITATION, PERSONAL_CITATION]);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The load-bearing case: one answer, two authorities. Labelling the
    // message as a whole would average them and lose the distinction.
    expect(within(items[0] as HTMLElement).getByText('dari dokumen klinik')).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(CLINIC_CITATION.title)).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('dari dokumen Anda')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText(PERSONAL_CITATION.title)).toBeInTheDocument();
  });

  it('distinguishes the two tiers by more than colour', () => {
    renderList([CLINIC_CITATION, PERSONAL_CITATION]);

    const items = screen.getAllByRole('listitem');
    const clinicIcon = (items[0] as HTMLElement).querySelector('[aria-hidden="true"]');
    const personalIcon = (items[1] as HTMLElement).querySelector('[aria-hidden="true"]');
    // Text differs, and so does the icon — a reader with a colour-vision
    // deficiency, or looking at a printed transcript, still gets the tier.
    expect(clinicIcon?.textContent).not.toBe(personalIcon?.textContent);
    expect(clinicIcon?.textContent).toBeTruthy();
  });

  it('keeps the reference number the reply’s [n] markers point at', () => {
    renderList([CLINIC_CITATION, PERSONAL_CITATION]);

    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });
});
