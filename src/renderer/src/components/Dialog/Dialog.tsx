import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './dialog.css'

const stack: HTMLDivElement[] = []
let rootWasInert = false
let rootWasHidden: string | null = null
const focusable = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
const controls = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>(focusable))
  .filter(control => control.getClientRects().length > 0 && !control.closest('[inert]'))

export const Dialog: React.FC<{
  label: string
  onClose: () => void
  scrimClass: string
  modalClass: string
  children: React.ReactNode
}> = ({ label, onClose, scrimClass, modalClass, children }) => {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const element = ref.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    if (!stack.length) {
      rootWasInert = root?.inert ?? false
      rootWasHidden = root?.getAttribute('aria-hidden') ?? null
    }
    if (root) root.inert = true
    const underneath = stack[stack.length - 1]
    if (underneath) underneath.inert = true
    stack.push(element)
    const first = element.querySelector<HTMLElement>('[autofocus]') ?? controls(element)[0] ?? element
    first.focus({ preventScroll: true })
    // Also hide the background from assistive technology on older webviews.
    root?.setAttribute('aria-hidden', 'true')
    underneath?.setAttribute('aria-hidden', 'true')
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || stack[stack.length - 1] !== element) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const buttons = controls(element)
        const first = buttons[0] ?? element
        const last = buttons[buttons.length - 1] ?? element
        if (!buttons.length || (event.shiftKey && (document.activeElement === first || document.activeElement === element)) ||
          (!event.shiftKey && (document.activeElement === last || document.activeElement === element))) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (stack[stack.length - 1] === element && !element.contains(event.target as Node)) {
        ;(controls(element)[0] ?? element).focus({ preventScroll: true })
      }
    }
    // Shortcut recording listens on window capture and can consume Escape first.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      stack.splice(stack.indexOf(element), 1)
      const top = stack[stack.length - 1]
      if (top) { top.inert = false; top.removeAttribute('aria-hidden') }
      if (root && !top) {
        root.inert = rootWasInert
        if (rootWasHidden == null) root.removeAttribute('aria-hidden')
        else root.setAttribute('aria-hidden', rootWasHidden)
      }
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true })
      else if (top) (controls(top)[0] ?? top).focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className={`${scrimClass} nm-dialog-scrim`} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div ref={ref} className={`${modalClass} nm-dialog`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>, document.body
  )
}
