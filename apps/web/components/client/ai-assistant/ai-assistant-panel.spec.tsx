import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AiAssistantPanel } from './ai-assistant-panel';

function renderPanel(): void {
  render(<AiAssistantPanel displayName="Dr. Sarah" replyDelayMs={0} />);
}

describe('AiAssistantPanel', () => {
  it('opens with the scripted greeting addressed to the signed-in user', () => {
    renderPanel();

    expect(screen.getByText(/Hello Dr\. Sarah\./)).toBeInTheDocument();
    expect(screen.getByText('Lab Report: 2024-04-14_Garcia.pdf')).toBeInTheDocument();
  });

  it('labels the screen as a preview and keeps the confidential-data disclaimer visible', () => {
    renderPanel();

    expect(screen.getByText(/Preview — simulated responses/)).toBeInTheDocument();
    expect(screen.getByText('CONFIDENTIAL PATIENT DATA:')).toBeInTheDocument();
  });

  it('replies with the scripted response when a suggested prompt is selected', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Summarize today's patient load/ }));

    expect(screen.getByText("Summarize today's patient load.")).toBeInTheDocument();
    expect(
      await screen.findByText(/14 patients are scheduled, with 3 marked as high-acuity and an average wait/),
    ).toBeInTheDocument();
  });

  it('replies with the fallback response to a free-text message', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(
      screen.getByRole('textbox', { name: 'Message the AI Clinical Assistant' }),
      'Suggest a treatment adjustment for Ms. Garcia.',
    );
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Suggest a treatment adjustment for Ms. Garcia.')).toBeInTheDocument();
    expect(await screen.findByText(/mild hypokalemia/)).toBeInTheDocument();
    expect(await screen.findByText(/This is an AI suggestion/)).toBeInTheDocument();
  });

  it('resets the thread when New Consultation is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /Summarize today's patient load/ }));
    await screen.findByText(/14 patients are scheduled, with 3 marked as high-acuity and an average wait/);

    await user.click(screen.getByRole('button', { name: 'New Consultation' }));

    expect(screen.queryByText("Summarize today's patient load.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/14 patients are scheduled, with 3 marked as high-acuity and an average wait/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Hello Dr\. Sarah\./)).toBeInTheDocument();
  });

  it('renders recent history entries as disabled preview items', () => {
    renderPanel();

    expect(
      screen.getByRole('button', { name: 'Medication conflict check - Patient #492' }),
    ).toBeDisabled();
  });
});
