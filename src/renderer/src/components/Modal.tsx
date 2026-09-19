import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  buttons: ReactNode
}

export function Modal({ title, children, buttons }: ModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-buttons">{buttons}</div>
      </div>
    </div>
  )
}
