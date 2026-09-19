import type { NotaraApi } from '@shared/types'

declare global {
  interface Window {
    notara: NotaraApi
  }
}

export {}
