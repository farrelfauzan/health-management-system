import { isAxiosError } from 'axios';

export function isApiStatusError(error: unknown, status: number): boolean {
  return isAxiosError(error) && error.response?.status === status;
}
