import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    include: ['**/*.spec.ts', '**/*.spec.tsx'],
    exclude: ['node_modules', '.next'],
  },
});
