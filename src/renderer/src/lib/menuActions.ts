import type { MenuAction } from '@shared/types'
import { api } from './api'
import { saveScheduler } from './saveScheduler'
import { editors } from './editorRegistry'
import { applyWrap } from './format'
import { openPath } from './openFile'
import { useTabs } from '../stores/tabs'
import { useUi } from '../stores/ui'
import { useWorkspace } from '../stores/workspace'

/** 取当前激活标签与其 vditor 实例；实例未就绪（init 中）时 vd 为 null */
async function activeVditor() {
  const tab = useTabs.getState().tabs[useTabs.getState().activeIndex]
  if (!tab) return null
  return { tab, vd: editors.get(tab.id) ?? null }
}

/** 另存为：弹保存对话框，成功后更新标签路径/标题/脏标记；用户取消或编辑器未就绪则不动 */
async function doSaveAs(): Promise<void> {
  const active = await activeVditor()
  if (!active) return
  const { tab, vd } = active
  if (!vd) return
  const r = await api.saveFileAs(`${tab.title}.md`, vd.getValue())
  if (!r) return // 用户取消
  useTabs.getState().setSaved(tab.id, r.path)
}

/** 处理菜单/快捷键动作（App 只做事件转发） */
export async function handleMenuAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'open': {
      const r = await api.openDialog()
      if (!r) return
      if (r.type === 'folder') await useWorkspace.getState().open(r.path)
      else await openPath(r.path)
      return
    }
    case 'new-file': {
      const root = useWorkspace.getState().root
      if (root) {
        // 工作区内新建：找不重名的 未命名-N.md
        for (let n = 1; n < 100; n++) {
          const name = `未命名-${n}.md`
          try {
            const { path } = await api.createEntry(root, name, 'file')
            await openPath(path)
            return
          } catch (e) {
            if ((e as { code?: string }).code !== 'target-exists') throw e
          }
        }
      }
      useTabs.getState().openUntitled()
      return
    }
    case 'save': {
      const active = await activeVditor()
      if (!active) return
      const { tab } = active
      if (tab.path === null || tab.deleted) {
        await doSaveAs()
        return
      }
      if (tab.dirty) await saveScheduler.flushOne(tab.id).catch(() => undefined)
      return
    }
    case 'save-as':
      await doSaveAs()
      return
    case 'close-tab': {
      const idx = useTabs.getState().activeIndex
      if (idx >= 0) window.dispatchEvent(new CustomEvent('notara:close-tab', { detail: idx }))
      return
    }
    case 'format-bold':
    case 'format-italic':
    case 'format-code': {
      const active = await activeVditor()
      if (!active?.vd) return
      const mark = action === 'format-bold' ? '**' : action === 'format-italic' ? '*' : '`'
      applyWrap(active.vd, mark)
      return
    }
    case 'format-link': {
      const active = await activeVditor()
      if (active?.vd) applyWrap(active.vd, 'link')
      return
    }
    case 'toggle-sidebar':
      useUi.getState().toggleSidebar()
      return
    case 'toggle-outline':
      useUi.getState().toggleOutline()
      return
    default:
      if (action.startsWith('set-theme:')) {
        const { useThemeStore } = await import('../stores/theme')
        await useThemeStore.getState().set(action.slice('set-theme:'.length))
      }
      // export-pdf / export-html 在 Task 15 接入，new-window 由主进程直接处理
      return
  }
}
