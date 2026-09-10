import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTabSearchParam } from './use-tab-search-param';

const { pushMock, navigation } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  navigation: { pathname: '/admin/rooms', search: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const ROOM_TABS = ['occupancy', 'wards', 'rooms', 'beds', 'classes'] as const;

type RoomTab = (typeof ROOM_TABS)[number];

type RenderTabHookOptions = {
  search: string;
  allowed?: readonly RoomTab[];
  initialTab?: RoomTab;
  key?: string;
};

function renderTabHook(options: RenderTabHookOptions) {
  const allowed = options.allowed ?? ROOM_TABS;
  navigation.search = options.search;
  return renderHook(() =>
    useTabSearchParam<RoomTab>({
      key: options.key,
      allowed,
      fallback: allowed[0] ?? 'occupancy',
      initialTab: options.initialTab,
    }),
  );
}

describe('useTabSearchParam', () => {
  afterEach(() => {
    pushMock.mockReset();
    navigation.search = '';
  });

  it('falls back when the URL names no tab', () => {
    const { result } = renderTabHook({ search: '' });
    expect(result.current.tab).toBe('occupancy');
  });

  it('falls back when the URL names an unknown tab', () => {
    const { result } = renderTabHook({ search: 'tab=kitchen' });
    expect(result.current.tab).toBe('occupancy');
  });

  it('opens the tab the URL names', () => {
    const { result } = renderTabHook({ search: 'tab=beds' });
    expect(result.current.tab).toBe('beds');
  });

  it('falls back to the first allowed tab when the URL names one this person may not see', () => {
    const { result } = renderTabHook({ search: 'tab=classes', allowed: ['wards', 'rooms'] });
    expect(result.current.tab).toBe('wards');
  });

  it('seeds from the server-read initial tab when the client has no value yet', () => {
    const { result } = renderTabHook({ search: '', initialTab: 'rooms' });
    expect(result.current.tab).toBe('rooms');
  });

  it('pushes a history entry on change and keeps the other parameters', () => {
    const { result } = renderTabHook({ search: 'page=2&tab=occupancy' });
    act(() => result.current.setTab('beds'));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/admin/rooms?page=2&tab=beds', { scroll: false });
  });

  it('does not push when the tab is already open', () => {
    const { result } = renderTabHook({ search: 'tab=beds' });
    act(() => result.current.setTab('beds'));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('writes under its own key so nested strips compose', () => {
    const { result } = renderTabHook({ search: 'tab=mappings', key: 'mapping' });
    expect(result.current.tab).toBe('occupancy');
    act(() => result.current.setTab('rooms'));
    expect(pushMock).toHaveBeenCalledWith('/admin/rooms?tab=mappings&mapping=rooms', {
      scroll: false,
    });
  });
});
