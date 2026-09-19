import { s } from '../strings'
import { Modal } from './Modal'

interface ConflictModalProps {
  path: string
  onKeepMine: () => void
  onUseDisk: () => void
}

/** 外部修改冲突弹窗：由 App 在 confirm 为冲突类型时挂载。 */
export function ConflictModal({ path, onKeepMine, onUseDisk }: ConflictModalProps) {
  return (
    <Modal
      title={s.confirm.useDiskTitle}
      buttons={
        <>
          <button className="btn" data-testid="conflict-disk" onClick={onUseDisk}>
            {s.confirm.useDisk}
          </button>
          <button className="btn btn-primary" data-testid="conflict-keep" onClick={onKeepMine}>
            {s.confirm.keepMine}
          </button>
        </>
      }
    >
      {path}
    </Modal>
  )
}
