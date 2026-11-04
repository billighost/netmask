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
}> = ({ anchor, onClose, children, id, role, className = '', width = 280 }) => {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState<React.CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.current || !ref.current) return
      const bounds = anchor.current.getBoundingClientRect()
      const screenWidth = document.documentElement.clientWidth
      const screenHeight = window.innerHeight
      const fittedWidth = Math.min(width, screenWidth - 16)
      // Measure with the final width so wrapped help text stays on screen.
      ref.current.style.width = fittedWidth + 'px'
      ref.current.style.maxHeight = screenHeight - 16 + 'px'
      const height = Math.min(ref.current.scrollHeight + 2, screenHeight - 16)
      const below = bounds.bottom + 6
      const above = bounds.top - height - 6
      const top = below + height <= screenHeight - 8 ? below : above >= 8 ? above : Math.max(8, Math.min(below, screenHeight - height - 8))
      setPosition({ left: Math.max(8, Math.min(bounds.left, screenWidth - fittedWidth - 8)), top, width: fittedWidth, maxHeight: screenHeight - 16, visibility: 'visible' })
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
    place()
    const observer = new ResizeObserver(place)
    observer.observe(ref.current!)
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [anchor, width])

  return createPortal(<div ref={ref} id={id} role={role} data-nm-popover className={`nm-popover ${className}`} style={position}>{children}</div>, document.body)
}
