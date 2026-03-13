import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.test.{js,mjs}'],
    environment: 'node',
  },
})
