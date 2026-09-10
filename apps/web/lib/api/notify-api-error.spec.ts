import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyApiError } from './notify-api-error';
import { notifyStatement } from './notify-statement';

vi.mock('./notify-statement', () => ({ notifyStatement: vi.fn() }));

describe('notifyApiError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('raises the fallback as an error statement when the failure carries no message', () => {
    const actualMessage = notifyApiError({ code: 'ECONNRESET' }, 'Could not save the patient.');

    expect(actualMessage).toBe('Could not save the patient.');
    expect(notifyStatement).toHaveBeenCalledWith({
      tone: 'error',
      title: 'Could not save the patient.',
    });
  });

  it('raises the resolved message as the statement title and returns it', () => {
    const actualMessage = notifyApiError(new Error('boom'), 'Could not save the patient.');

    expect(actualMessage).toBe('boom');
    expect(notifyStatement).toHaveBeenCalledWith({ tone: 'error', title: 'boom' });
  });
});
