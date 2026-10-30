import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// Версия демо-проекта = хэш его исходника: правка core/src/demo.ts сама меняет версию, и сохранённое демо обновляется
const demoVersion = createHash('sha1').update(readFileSync(path.resolve(import.meta.dirname, '../core/src/demo.ts'))).digest('hex').slice(0, 12);

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __DEMO_VERSION__: JSON.stringify(demoVersion) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@va/core': path.resolve(import.meta.dirname, '../core/src/index.ts'), '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 5173 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
