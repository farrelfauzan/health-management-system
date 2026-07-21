import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from './login-form';
import { authControllerLoginV1 } from '#lib/api/generated/auth/auth';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';

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
}));

const loginRequestMock = vi.mocked(authControllerLoginV1);

function renderLoginForm(): ReactElement | void {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

function clearSessionCookies(): void {
  document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
  document.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/`;
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
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 8/i)).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('persists the session cookies and redirects to the dashboard on success', async () => {
    const user = userEvent.setup();
    loginRequestMock.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: {
        data: {
          accessToken: 'header.payload.signature',
          refreshToken: 'refresh.payload.signature',
          tokenType: 'Bearer',
          expiresIn: '15m',
        },
        message: 'Login success',
      },
    } as never);
    renderLoginForm();

    await user.type(screen.getByLabelText('Email'), 'admin@salingjaga.com');
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(document.cookie).toContain(`${ACCESS_TOKEN_COOKIE_NAME}=header.payload.signature`);
    expect(document.cookie).toContain(`${REFRESH_TOKEN_COOKIE_NAME}=refresh.payload.signature`);
    expect(replaceMock).toHaveBeenCalledWith('/admin/dashboard');
  });
});
