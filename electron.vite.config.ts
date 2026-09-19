import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': new URL('./src/shared', import.meta.url).pathname }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': new URL('./src/shared', import.meta.url).pathname,
        '@': new URL('./src/renderer/src', import.meta.url).pathname
      }
    }
  }
})
