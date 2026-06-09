import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Unit tests run WITHOUT booting Nuxt: pure domain code and DS components mount
// standalone. Keep it that way — this is the fast feedback loop (ARCHITECTURE.md §7).
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    // tests/e2e belongs to Playwright — vitest must never pick it up
    include: [
      'app/**/*.{test,spec}.ts',
      'tests/unit/**/*.{test,spec}.ts',
    ],
  },
})
