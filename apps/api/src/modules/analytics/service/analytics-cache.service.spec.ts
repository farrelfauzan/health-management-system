import { AnalyticsCacheService } from './analytics-cache.service';

describe('AnalyticsCacheService', () => {
  const FIVE_MINUTES_MS = 5 * 60_000;

  afterEach(() => {
    jest.useRealTimers();
  });

  it('answers the same dashboard and filter from cache for five minutes', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-28T02:00:00.000Z') });
    const cache = new AnalyticsCacheService();
    const mockLoad = jest.fn(async () => 'figures');
    const inputKey = { dashboard: 'operations', filter: { from: '2026-09-01', to: '2026-09-30' } };

    await cache.getOrLoad({ key: inputKey, load: mockLoad });
    jest.setSystemTime(Date.now() + FIVE_MINUTES_MS - 1);
    await cache.getOrLoad({ key: inputKey, load: mockLoad });
    jest.setSystemTime(Date.now() + 2);
    await cache.getOrLoad({ key: inputKey, load: mockLoad });

    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('keys by filter regardless of property order or unset fields', async () => {
    const cache = new AnalyticsCacheService();
    const mockLoad = jest.fn(async () => 'figures');

    await cache.getOrLoad({
      key: {
        dashboard: 'finance',
        filter: { from: '2026-09-01', to: '2026-09-30', doctorId: undefined },
      },
      load: mockLoad,
    });
    await cache.getOrLoad({
      key: { dashboard: 'finance', filter: { to: '2026-09-30', from: '2026-09-01' } },
      load: mockLoad,
    });

    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('keeps dashboards, filters and viewers apart', async () => {
    const cache = new AnalyticsCacheService();
    const mockLoad = jest.fn(async () => 'figures');
    const inputFilter = { from: '2026-09-01', to: '2026-09-30' };

    await cache.getOrLoad({
      key: { dashboard: 'operations', filter: inputFilter },
      load: mockLoad,
    });
    await cache.getOrLoad({ key: { dashboard: 'finance', filter: inputFilter }, load: mockLoad });
    await cache.getOrLoad({
      key: { dashboard: 'practice', filter: inputFilter, viewerId: 'a' },
      load: mockLoad,
    });
    await cache.getOrLoad({
      key: { dashboard: 'practice', filter: inputFilter, viewerId: 'b' },
      load: mockLoad,
    });

    expect(mockLoad).toHaveBeenCalledTimes(4);
  });

  it('shares one load between concurrent requests', async () => {
    const cache = new AnalyticsCacheService();
    const mockLoad = jest.fn(async () => 'figures');
    const inputKey = { dashboard: 'operations', filter: {} };

    await Promise.all([
      cache.getOrLoad({ key: inputKey, load: mockLoad }),
      cache.getOrLoad({ key: inputKey, load: mockLoad }),
    ]);

    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed load', async () => {
    const cache = new AnalyticsCacheService();
    const inputKey = { dashboard: 'operations', filter: {} };
    const mockLoad = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('figures');

    await expect(cache.getOrLoad({ key: inputKey, load: mockLoad })).rejects.toThrow('timeout');
    const actual = await cache.getOrLoad({ key: inputKey, load: mockLoad });

    expect(actual).toBe('figures');
  });
});
