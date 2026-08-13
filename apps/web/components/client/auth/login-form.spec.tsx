import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';
import { authControllerLoginV1 } from '#lib/api/generated/auth/auth';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import messages from '../../../messages/id/auth-shell.json';

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('#lib/api/generated/auth/auth', () => ({
  authControllerLoginV1: vi.fn(),
  // The enrolment step fetches a secret as soon as it mounts. Left unmocked it
  // would reach for the real axios client; the SJ-8 case below only cares that
  // the step rendered and that nothing was persisted, so it never resolves.
  authControllerBeginMfaEnrolmentV1: vi.fn(() => new Promise(() => undefined)),
  authControllerVerifyMfaEnrolmentV1: vi.fn(),
  authControllerAnswerMfaChallengeV1: vi.fn(),
}));

const loginRequestMock = vi.mocked(authControllerLoginV1);

function renderLoginForm(): ReactElement | void {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="id" messages={messages}>
        <LoginForm />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function clearSessionCookies(): void {
  document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
  document.cookie = `${SESSION_HINT_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

describe('LoginForm', () => {
  beforeEach(() => {
    clearSessionCookies();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearSessionCookies();
  });

  it('renders schema validation errors and skips the request for invalid input', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Kata sandi'), 'short');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByText('Masukkan alamat email yang valid.')).toBeInTheDocument();
    expect(
      screen.getByText('Kata sandi harus terdiri dari minimal 8 karakter.'),
    ).toBeInTheDocument();
    expect(loginRequestMock).not.toHaveBeenCalled();
  });

  it('renders the invalid-credentials message when the login request fails', async () => {
    const user = userEvent.setup();
    loginRequestMock.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
        },
      }),
    );
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'doctor@salingjaga.com');
    await user.type(screen.getByLabelText('Kata sandi'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email atau kata sandi tidak valid.',
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('persists the access token and redirects to the dashboard on success', async () => {
    const user = userEvent.setup();
    loginRequestMock.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        data: {
          status: 'AUTHENTICATED',
          tokens: {
            accessToken: 'header.payload.signature',
            tokenType: 'Bearer',
            expiresIn: '15m',
          },
        },
        message: 'Login success',
      },
    } as never);
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'admin@salingjaga.com');
    await user.type(screen.getByLabelText('Kata sandi'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByRole('button', { name: 'Masuk' })).toBeEnabled();
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=header.payload.signature`);
    // The refresh token and the session hint are both set by the API as
    // response cookies (SJ-6), so this tier neither receives nor writes them.
    expect(document.cookie).not.toContain(SESSION_HINT_COOKIE_NAME);
    expect(replaceMock).toHaveBeenCalledWith('/admin/dashboard');
  });

  /**
   * SJ-8 — a correct password is no longer the end of it. These two cases pin
   * the property that matters on this tier: no access token is written and no
   * redirect happens until the second factor is settled.
   */
  it('shows the challenge step and stores nothing when a second factor is required', async () => {
    const user = userEvent.setup();
    loginRequestMock.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        data: {
          status: 'MFA_REQUIRED',
          mfaTicket: { ticket: 'pending.ticket.value', expiresIn: '120s' },
        },
        message: 'Second factor required',
      },
    } as never);
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'admin@salingjaga.com');
    await user.type(screen.getByLabelText('Kata sandi'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(await screen.findByLabelText('Kode autentikasi')).toBeInTheDocument();
    expect(document.cookie).not.toContain(ACCESS_TOKEN_COOKIE_NAME);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows the enrolment step when a privileged account has no second factor', async () => {
    const user = userEvent.setup();
    loginRequestMock.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        data: {
          status: 'MFA_ENROLMENT_REQUIRED',
          mfaTicket: { ticket: 'pending.ticket.value', expiresIn: '120s' },
        },
        message: 'Second factor required',
      },
    } as never);
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'admin@salingjaga.com');
    await user.type(screen.getByLabelText('Kata sandi'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(
      await screen.findByRole('heading', { name: 'Aktifkan verifikasi dua faktor' }),
    ).toBeInTheDocument();
    expect(document.cookie).not.toContain(ACCESS_TOKEN_COOKIE_NAME);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
