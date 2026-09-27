import { optionalExample } from './api-endpoint.decorator';

/** Request and response examples for the P29 analytics endpoints. */
export const ANALYTICS_EXAMPLES = {
  operations: {
    response: {
      data: {
        totals: {},
        series: [],
        breakdowns: {},
        // Only with `compare=true`.
        comparison: optionalExample({ from: '2026-08-01', to: '2026-08-31', totals: {} }),
      },
      meta: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Asia/Jakarta',
        granularity: 'day',
        generatedAt: '2026-09-28T02:00:00.000Z',
      },
    },
  },
} as const;
