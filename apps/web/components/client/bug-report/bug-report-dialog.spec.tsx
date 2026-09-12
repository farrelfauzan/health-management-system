import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/en/auth-shell.json';

const { submitReportMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  submitReportMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('#lib/api/generated/bug-reports/bug-reports', () => ({
  bugReportControllerSubmitReportV1: (input: unknown) => submitReportMock(input),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/laboratory/3f1a2b3c-1111-4111-8111-111111111111/edit',
}));

vi.mock('#lib/api/failed-request-buffer', () => ({
  readFailedRequestIds: () => ['req-1', 'req-2'],
}));

vi.mock('@hms/ui', async () => {
  const actual = await vi.importActual<typeof import('@hms/ui')>('@hms/ui');
  return { ...actual, toast: { success: toastSuccessMock, error: toastErrorMock } };
});

const { BugReportDialog } = await import('./bug-report-dialog');

function renderDialog(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Jakarta">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <BugReportDialog open onOpenChange={() => undefined} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function respondWithSubmission(): void {
  submitReportMock.mockResolvedValue({
    status: 202,
    data: { data: { reference: 'BR-000042', status: 'RECEIVED' } },
  });
}

/** A 400 shaped the way the API raises `SENSITIVE_DATA_DETECTED` (P23-T08). */
function buildSensitiveDataError(field: string): AxiosError {
  const error = new AxiosError('request failed');
  error.response = {
    status: 400,
    statusText: '',
    data: {
      code: 'SENSITIVE_DATA_DETECTED',
      message: 'This field looks like it contains sensitive data (MRN).',
      errors: [{ path: [field], category: 'MRN' }],
    },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('What is the problem, in one line?'), 'Lab list empty');
  await user.type(screen.getByLabelText('What happened?'), 'The lab list does not load.');
}

describe('BugReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The tick is the one control that addresses what patterns cannot catch — a
   * name, a room number, a clinical detail in prose (§5c). So submit stays
   * disabled until the reporter has actually read and agreed to it.
   */
  it('keeps submit disabled until the confirmation is ticked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);

    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();

    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));

    expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
  });

  /**
   * The acceptance criterion: a phone number appears as a finding and the report
   * cannot be sent until it is gone. There is deliberately no "send anyway".
   */
  it('blocks submission while a field still looks like it carries a phone number', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    await user.type(screen.getByLabelText('What happened?'), ' Call 0812 3456 7890.');

    expect(await screen.findByText(/a phone number/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
  });

  it('re-enables submit once the reporter removes the finding', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    const descriptionField = screen.getByLabelText('What happened?');
    await user.type(descriptionField, ' NIK 3174091234567890');

    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();

    await user.clear(descriptionField);
    await user.type(descriptionField, 'The lab list does not load.');

    expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled();
  });

  /** The finding names the category and never quotes what it matched. */
  it('names the category without echoing the matched text', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('What happened?'), 'NIK 3174091234567890');

    const finding = await screen.findByText(/a national ID number/);
    expect(finding).toBeInTheDocument();
    expect(finding.textContent).not.toContain('3174091234567890');
  });

  it('sends the report and shows the reference on success', async () => {
    respondWithSubmission();
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Thank you. Your report is BR-000042.');
    });
  });

  /**
   * The path is cleaned before it is sent *and* before it is shown: intake strips
   * the query string and replaces record ids with `:id`, and a raw route in the
   * notice would reassure the reporter about the wrong string.
   */
  it('sends the page path with its record id replaced', async () => {
    respondWithSubmission();
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => {
      expect(submitReportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pagePath: '/admin/laboratory/:id/edit',
          requestIds: ['req-1', 'req-2'],
          acknowledgedNoSensitiveData: true,
        }),
      );
    });
  });

  /**
   * An MRN is the finding only the server can make — the prefix and width are
   * server configuration the browser has no business learning — so the refusal
   * has to land on the named field rather than in a generic toast.
   */
  it('renders a server-side sensitive-data refusal on the field it names', async () => {
    submitReportMock.mockRejectedValue(buildSensitiveDataError('description'));
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(
      await screen.findByText('This field looks like it contains sensitive data (MRN).'),
    ).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('clears the server error once the reporter edits that field', async () => {
    submitReportMock.mockRejectedValue(buildSensitiveDataError('description'));
    const user = userEvent.setup();
    renderDialog();
    await fillRequiredFields(user);
    await user.click(screen.getByLabelText('This report contains no patient data or passwords'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText('This field looks like it contains sensitive data (MRN).');

    await user.type(screen.getByLabelText('What happened?'), ' edited');

    expect(
      screen.queryByText('This field looks like it contains sensitive data (MRN).'),
    ).not.toBeInTheDocument();
  });

  /**
   * The reporter is being asked to take responsibility for what leaves the
   * clinic, and cannot do that for fields they do not know are attached.
   */
  it('tells the reporter what rides along besides their words', () => {
    renderDialog();

    // Matched on the typographic apostrophe the copy actually uses, not the
    // ASCII one — the two are different characters and only one is on screen.
    const notice = screen.getByText(/also send/);
    expect(notice).toHaveTextContent('/admin/laboratory/:id/edit');
    expect(notice).toHaveTextContent('2 recent request IDs');
  });

  it('shows the warning banner, which cannot be dismissed', () => {
    renderDialog();

    expect(screen.getByRole('note')).toHaveTextContent('Do not include patient data');
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });
});
