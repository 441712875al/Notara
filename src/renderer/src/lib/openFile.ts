import { api } from './api'
import { parseIpcError } from './ipcError'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { s } from '../strings'

/** 读取文件并打开标签；失败（二进制/不存在等）toast 提示；opts.silent 时静默跳过（用于启动恢复） */
export async function openPath(path: string, opts?: { silent?: boolean }): Promise<void> {
  try {
    const { content } = await api.readFile(path)
    useTabs.getState().openFile(path, content)
  } catch (e) {
    if (opts?.silent) return
    const { code, message } = parseIpcError(e)
    useUi
      .getState()
      .notify(code === 'binary-file' ? s.toast.binaryFile : s.toast.openFailed(message))
  }
}
