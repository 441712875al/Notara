export class NotaraError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'NotaraError'
  }
}

// 统一错误码（服务层只抛这些）
export const ErrorCodes = {
  NotFound: 'not-found',
  BinaryFile: 'binary-file',
  WriteFailed: 'write-failed',
  InvalidName: 'invalid-name',
  TargetExists: 'target-exists',
  Cancelled: 'cancelled',
  ThemeImportFailed: 'theme-import-failed',
  Unknown: 'unknown'
} as const
