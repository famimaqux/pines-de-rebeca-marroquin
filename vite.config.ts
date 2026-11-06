/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pines-de-rebeca-marroquin/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
