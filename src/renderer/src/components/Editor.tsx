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

  useEffect(() => {
    if (!hostRef.current) return
    const vd = new Vditor(hostRef.current, {
      mode: 'ir',
      lang: 'zh_CN',
      value: initial,
      cache: { enable: false },
      toolbar: [],
      height: '100%',
      cdn: './vditor', // 指向 public/vditor（脚本拷贝），离线可用
      outline: { enable: true, position: 'left' },
      input: () => onInputRef.current(tabId)
    })
    editors.set(tabId, vd)
    return () => {
      editors.delete(tabId)
      vd.destroy()
    }
    // initial 只在挂载时消费一次；后续内容由 vditor 管理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // 切换到该标签时聚焦
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
