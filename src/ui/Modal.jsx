import { useRef } from 'react'
import { useFocusTrap, useEscapeKey } from './a11y'

/**
 * Shared meadow dialog shell — glass drawer matching shop aesthetics.
 */
export default function Modal({
  open,
  onClose,
  title,
  titleId = 'modal-title',
  icon,
  children,
  footer,
  className = '',
  wide = false,
}) {
  const panelRef = useRef(null)
  useFocusTrap(panelRef, open)
  useEscapeKey(open, onClose)

  if (!open) return null

  return (
    <div
      className="modal-overlay shop-overlay no-look"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`modal-drawer shop-drawer${wide ? ' modal-wide' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="shop-header modal-header">
          <div className="shop-title" id={titleId}>
            {icon != null && (
              <span className="shop-title-icon" aria-hidden="true">{icon}</span>
            )}
            <span>{title}</span>
          </div>
          <button
            type="button"
            className="shop-close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer != null && <div className="modal-footer shop-hint">{footer}</div>}
      </div>
    </div>
  )
}
