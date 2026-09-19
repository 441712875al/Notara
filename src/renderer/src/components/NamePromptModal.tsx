import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useUi, type NamePromptRequest } from '../stores/ui'
import { s } from '../strings'

/**
 * 名称输入弹窗（新建/重命名共用）。
 * 注意：外层组件常驻挂载（无 prompt 时返回 null），因此把输入框状态放在
 * 仅在弹窗打开时挂载的内层组件里——关闭即卸载、重开即重挂，天然避免上次输入残留；
 * 内层再用 effect 响应 prompt 变化兜底（弹窗已开时再次 openNamePrompt 也能重置）。
 */
export function NamePromptModal() {
  const prompt = useUi((st) => st.namePrompt)
  const close = useUi((st) => st.closeNamePrompt)
  if (!prompt) return null
  return <NamePromptContent prompt={prompt} close={close} />
}

function NamePromptContent({
  prompt,
  close
}: {
  prompt: NamePromptRequest
  close: () => void
}) {
  const [value, setValue] = useState(prompt.initial)

  // 每次打开（prompt 从 null 变为非 null，或身份变化）都重置为 initial，避免残留
  useEffect(() => {
    setValue(prompt.initial)
  }, [prompt])

  const submit = (): void => {
    const name = value.trim()
    if (!name) return
    prompt.onSubmit(name)
    close()
  }

  return (
    <Modal
      title={prompt.title}
      buttons={
        <>
          <button className="btn" onClick={close}>
            {s.confirm.cancel}
          </button>
          <button className="btn btn-primary" disabled={!value.trim()} onClick={submit}>
            {s.confirm.save}
          </button>
        </>
      }
    >
      <input
        autoFocus
        className="name-input"
        value={value}
        placeholder={prompt.initial || prompt.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
    </Modal>
  )
}
