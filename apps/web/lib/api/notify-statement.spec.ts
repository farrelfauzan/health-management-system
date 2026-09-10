import { toast } from '@hms/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyStatement } from './notify-statement';

vi.mock('@hms/ui', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe('notifyStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['error', toast.error],
    ['warning', toast.warning],
    ['success', toast.success],
    ['info', toast.info],
  ] as const)('routes the %s tone to the matching toast type', (inputTone, expectedToast) => {
    notifyStatement({ tone: inputTone, title: 'Check-in is outside the session' });

    expect(expectedToast).toHaveBeenCalledWith('Check-in is outside the session', undefined);
  });

  it('passes the description through as the toast description', () => {
    notifyStatement({
      tone: 'error',
      title: 'The clinic profile has not been configured yet',
      description: 'Ask an administrator to complete it.',
    });

    expect(toast.error).toHaveBeenCalledWith('The clinic profile has not been configured yet', {
      description: 'Ask an administrator to complete it.',
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
