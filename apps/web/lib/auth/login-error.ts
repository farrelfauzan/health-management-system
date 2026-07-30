import { isAxiosError } from 'axios';
export type LoginErrorMessages = {
  invalidCredentials: string;
  loginFailed: string;
};

export function resolveLoginErrorMessage(error: unknown, messages: LoginErrorMessages): string {
  if (!isAxiosError(error)) {
    return messages.loginFailed;
  }

  if (error.response?.status === 401) {
    return messages.invalidCredentials;
  }

  return messages.loginFailed;
}
