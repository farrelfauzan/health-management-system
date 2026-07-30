import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { AiAssistantPanel } from './ai-assistant-panel';
import { getDashboardAiMessages } from '#lib/dashboard/localization';

function renderPanel(): void {
  render(
    <NextIntlClientProvider locale="id" messages={getDashboardAiMessages('id')}>
      <AiAssistantPanel displayName="Dr. Sarah" replyDelayMs={0} />
    </NextIntlClientProvider>,
  );
}

describe('AiAssistantPanel', () => {
  it('opens with the scripted greeting addressed to the signed-in user', () => {
    renderPanel();

    expect(screen.getByText(/Halo Dr\. Sarah\./)).toBeInTheDocument();
    expect(screen.getByText('Laporan Lab: 2024-04-14_Garcia.pdf')).toBeInTheDocument();
  });

  it('labels the screen as a preview and keeps the confidential-data disclaimer visible', () => {
    renderPanel();

    expect(screen.getByText(/Pratinjau — respons simulasi/)).toBeInTheDocument();
    expect(screen.getByText('DATA PASIEN RAHASIA:')).toBeInTheDocument();
  });

  it('replies with the scripted response when a suggested prompt is selected', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));

    expect(screen.getByText('Ringkas beban pasien hari ini.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /14 pasien dijadwalkan, 3 di antaranya ditandai dengan kegawatan tinggi/,
      ),
    ).toBeInTheDocument();
  });

  it('replies with the fallback response to a free-text message', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(
      screen.getByRole('textbox', { name: 'Kirim pesan ke Asisten Klinis AI' }),
      'Suggest a treatment adjustment for Ms. Garcia.',
    );
    await user.click(screen.getByRole('button', { name: 'Kirim pesan' }));

    expect(screen.getByText('Suggest a treatment adjustment for Ms. Garcia.')).toBeInTheDocument();
    expect(await screen.findByText(/hipokalemia ringan/)).toBeInTheDocument();
    expect(await screen.findByText(/Ini adalah saran AI/)).toBeInTheDocument();
  });

  it('resets the thread when New Consultation is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Ringkas beban pasien hari ini/ }));
    await screen.findByText(
      /14 pasien dijadwalkan, 3 di antaranya ditandai dengan kegawatan tinggi/,
    );

    await user.click(screen.getByRole('button', { name: 'Konsultasi Baru' }));

    expect(screen.queryByText('Ringkas beban pasien hari ini.')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/14 pasien dijadwalkan, 3 di antaranya ditandai dengan kegawatan tinggi/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Halo Dr\. Sarah\./)).toBeInTheDocument();
  });

  it('renders recent history entries as disabled preview items', () => {
    renderPanel();

    expect(
      screen.getByRole('button', { name: 'Pemeriksaan konflik obat - Pasien #492' }),
    ).toBeDisabled();
  });
});
