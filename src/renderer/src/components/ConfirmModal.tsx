import { useUi } from '../stores/ui'
import { s } from '../strings'
import { Modal } from './Modal'

export function ConfirmModal() {
  const confirm = useUi((st) => st.confirm)
  const resolve = useUi((st) => st.resolveConfirm)
  if (!confirm) return null
  return (
    <Modal
      title={confirm.title}
      buttons={
        <>
          <button className="btn" onClick={() => resolve(false)}>
            {s.confirm.cancel}
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
