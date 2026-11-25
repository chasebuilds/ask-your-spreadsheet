import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE ?? '/ask-your-spreadsheet/',
  test: { include: ['tests/unit/**/*.test.js'] },
});
