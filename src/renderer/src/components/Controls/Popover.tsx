import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './controls.css'

export const Popover: React.FC<{
  anchor: React.RefObject<HTMLElement>
  onClose: () => void
  children: React.ReactNode
  id: string
  role?: React.AriaRole
  className?: string
  width?: number
  placement?: 'vertical' | 'side'
  closeOnBlur?: boolean
  positionKey?: string
}> = ({ anchor, onClose, children, id, role, className = '', width = 280, placement = 'vertical', closeOnBlur = false, positionKey }) => {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    let frame = 0
    const place = () => {
      if (!anchor.current || !ref.current) return
      const bounds = anchor.current.getBoundingClientRect()
      const screenWidth = document.documentElement.clientWidth
      const screenHeight = window.innerHeight
      const fittedWidth = Math.min(width, screenWidth - 16)
      const leftSide = placement === 'side' && bounds.left >= fittedWidth + 16
      const rightSide = placement === 'side' && !leftSide && bounds.right + fittedWidth + 16 <= screenWidth
      const beside = leftSide || rightSide
      const belowSpace = screenHeight - bounds.bottom - 14
      const aboveSpace = bounds.top - 14
      const constrainedSide = placement === 'side' && !beside && Math.max(belowSpace, aboveSpace) >= 120
      const placeBelow = belowSpace >= aboveSpace
      const maxHeight = constrainedSide ? Math.min(screenHeight - 16, Math.max(belowSpace, aboveSpace)) : screenHeight - 16
      // Measure with the final width so wrapped help text stays on screen.
      ref.current.style.width = fittedWidth + 'px'
      ref.current.style.maxHeight = maxHeight + 'px'
      const height = Math.min(ref.current.scrollHeight + 2, maxHeight)
      const below = bounds.bottom + 6
      const above = bounds.top - height - 6
      const top = beside ? Math.max(8, Math.min(bounds.top, screenHeight - height - 8))
        : constrainedSide ? placeBelow ? below : above
        : below + height <= screenHeight - 8 ? below : above >= 8 ? above : Math.max(8, Math.min(below, screenHeight - height - 8))
      const next = { left: leftSide ? bounds.left - fittedWidth - 8 : rightSide ? bounds.right + 8 : Math.max(8, Math.min(bounds.left, screenWidth - fittedWidth - 8)), top, width: fittedWidth, maxHeight, visibility: 'visible' as const }
      setPosition(previous => previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.maxHeight === next.maxHeight && previous.visibility === next.visibility ? previous : next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; place() })
    }
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close.current()
    }
    const blur = () => close.current()
    place()
    const observer = new ResizeObserver(schedule)
    observer.observe(ref.current!)
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    if (closeOnBlur) window.addEventListener('blur', blur)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
      if (closeOnBlur) window.removeEventListener('blur', blur)
    }
  }, [anchor, width, placement, closeOnBlur, positionKey])

  return createPortal(<div ref={ref} id={id} role={role} data-nm-popover className={`nm-popover ${className}`} style={position}>{children}</div>, document.body)
}
