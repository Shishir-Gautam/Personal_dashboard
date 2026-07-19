import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { setupFiles: ['src/test/setup.ts'], testTimeout: 30000, hookTimeout: 60000 },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
