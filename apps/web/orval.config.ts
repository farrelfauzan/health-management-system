import { defineConfig } from 'orval';

export default defineConfig({
  hms: {
    input: {
      target: process.env.ORVAL_OPENAPI_URL ?? '../api/openapi.yaml',
    },
    output: {
      mode: 'tags-split',
      target: './lib/api/generated/index.ts',
      schemas: './lib/api/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: {
          path: './lib/api/http.ts',
          name: 'orvalAxiosMutator',
        },
        query: {
          useQuery: true,
          useInfinite: false,
        },
      },
    },
  },
});
