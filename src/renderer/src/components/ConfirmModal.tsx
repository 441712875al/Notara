import { useUi } from '../stores/ui'
import { s } from '../strings'
import { Modal } from './Modal'

export function ConfirmModal() {
  const confirm = useUi((st) => st.confirm)
  const resolve = useUi((st) => st.resolveConfirm)
  const resolveDiscard = useUi((st) => st.resolveDiscard)
  // 外部修改冲突由 ConflictModal 专用渲染，此处让位
  if (!confirm || confirm.title === s.confirm.useDiskTitle) return null
  return (
    <Modal
      title={confirm.title}
      buttons={
        <>
          {confirm.discard ? (
            <button className="btn btn-danger" onClick={() => resolveDiscard()}>
              {confirm.discard.text}
            </button>
          ) : null}
          <button className="btn" onClick={() => resolve(false)}>
            {confirm.cancelText ?? s.confirm.cancel}
          </button>
          <button
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => resolve(true)}
          >
            {confirm.confirmText}
          </button>
        </>
      }
    >
      {confirm.text}
    </Modal>
  )
}
