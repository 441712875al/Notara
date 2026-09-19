import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const sharedAlias = {
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url))
}

export default defineConfig({
  resolve: {
    alias: sharedAlias
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.spec.ts']
        }
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.spec.tsx'],
          setupFiles: ['./tests/component/setup.ts']
        }
      }
    ]
  }
})
