import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 未启用 vitest globals 时 RTL 不会自动注册清理，需显式挂载 afterEach
afterEach(() => {
  cleanup()
})
