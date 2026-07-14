import { useStore } from '../store'

const TYPE_ICON = {
  info: '·',
  success: '✓',
  error: '!',
  warn: '…',
}

export default function Toast() {
  const toast = useStore((s) => s.toast)
  const type = toast?.type || 'info'
  const live = type === 'error' ? 'assertive' : 'polite'

  return (
    <div
      className={`toast${toast ? ' show' : ''} toast-${type}`}
      role="status"
      aria-live={live}
      aria-atomic="true"
    >
      {toast && (
        <>
          <span className="toast-icon" aria-hidden="true">{TYPE_ICON[type] || TYPE_ICON.info}</span>
          <span className="toast-msg">{toast.msg}</span>
        </>
      )}
    </div>
  )
}
