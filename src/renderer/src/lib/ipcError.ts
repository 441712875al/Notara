/** preload 将 IPC 错误码编码为 message 前缀（`[code] message`）；此工具解回供分支判别与展示 */
export function parseIpcError(e: unknown): { code: string | null; message: string } {
  const msg = e instanceof Error ? e.message : String(e)
  const m = /^\[([a-z0-9-]+)\] (.*)$/s.exec(msg)
  return m ? { code: m[1], message: m[2] } : { code: null, message: msg }
}
