import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from './global-search';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('GlobalSearch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the patient directory with the encoded query on submit', async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);

    await user.type(screen.getByRole('searchbox', { name: 'Search patients' }), 'chest pain');
    await user.keyboard('{Enter}');

    expect(pushMock).toHaveBeenCalledWith('/admin/patients?q=chest%20pain');
  });

  it('does not navigate when the query is blank', async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);

    await user.type(screen.getByRole('searchbox', { name: 'Search patients' }), '   ');
    await user.keyboard('{Enter}');

    expect(pushMock).not.toHaveBeenCalled();
  });
});
