import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { editors } from '../lib/editorRegistry'

interface EditorProps {
  tabId: number
  initial: string
  active: boolean
  onInput: (tabId: number) => void
}

export function Editor({ tabId, initial, active, onInput }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  // 供 after 回调读取最新 active（不参与 effect 依赖，避免重建 vditor）
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // 每个 effect 实例挂到自己的子节点：vditor 的 init 是异步的，若两次挂载（StrictMode）共用
    // 同一节点，先建实例的后置 destroy 会清掉后建实例的渲染结果。
    const mount = document.createElement('div')
    mount.style.height = '100%'
    host.appendChild(mount)

    let disposed = false
    let ready = false
    const vd = new Vditor(mount, {
      mode: 'ir',
      lang: 'zh_CN',
      value: initial,
      cache: { enable: false },
      toolbar: [],
      height: '100%',
      cdn: './vditor', // 指向 public/vditor（脚本拷贝），离线可用
      outline: { enable: true, position: 'left' },
      input: () => onInputRef.current(tabId),
      // vditor 构造返回时 this.vditor 尚未定义（init 在 i18n 脚本加载后才异步执行），
      // 此时调用 focus/getValue/destroy 都会抛错。after 在 init 完成时触发，是首次安全时机。
      after: () => {
        ready = true
        if (disposed) {
          vd.destroy() // 卸载后才完成初始化：补销毁，避免实例泄漏
          return
        }
        editors.set(tabId, vd)
        if (activeRef.current) vd.focus()
      }
    })
    return () => {
      disposed = true
      editors.delete(tabId)
      mount.remove()
      if (ready) vd.destroy() // 未就绪则交由 after 补销毁（此时 mount 已脱离文档，销毁无副作用）
    }
    // initial 只在挂载时消费一次；后续内容由 vditor 管理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // 切换到该标签时聚焦（首次挂载的聚焦由 after 回调负责）
  useEffect(() => {
    if (active) editors.get(tabId)?.focus()
  }, [active, tabId])

  return (
    <div
      ref={hostRef}
      style={{ display: active ? 'block' : 'none', height: '100%' }}
      data-testid={`editor-${tabId}`}
    />
  )
}
