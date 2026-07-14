import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getFocusable(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null
  )
}

/**
 * Trap Tab focus inside a dialog while `active`. Restores focus on close.
 * @param {React.RefObject} containerRef
 * @param {boolean} active
 * @param {{ initialFocus?: 'first' | 'container' }} [opts]
 */
export function useFocusTrap(containerRef, active, opts = {}) {
  const prevFocus = useRef(null)

  useEffect(() => {
    if (!active) return
    const root = containerRef.current
    if (!root) return

    prevFocus.current = document.activeElement

    const focusFirst = () => {
      const list = getFocusable(root)
      if (opts.initialFocus === 'container') {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
        root.focus({ preventScroll: true })
      } else if (list[0]) {
        list[0].focus({ preventScroll: true })
      } else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
        root.focus({ preventScroll: true })
      }
    }

    // After paint so children exist
    const t = requestAnimationFrame(focusFirst)

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const list = getFocusable(root)
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last || !root.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(t)
      root.removeEventListener('keydown', onKeyDown)
      const prev = prevFocus.current
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus({ preventScroll: true }) } catch { /* ignore */ }
      }
    }
  }, [active, containerRef, opts.initialFocus])
}

/** Close on Escape while active (capture so game controls don't steal it). */
export function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active || !onClose) return
    const onKey = (e) => {
      if (e.code === 'Escape' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, onClose])
}

/** Mark document body as modal-open for optional CSS (scroll lock already fixed). */
export function useModalOpenClass(active) {
  useEffect(() => {
    if (!active) return
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [active])
}
