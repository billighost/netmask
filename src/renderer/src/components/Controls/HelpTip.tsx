import React, { useId, useRef, useState } from 'react'
import { Popover } from './Popover'

export const HelpTip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const id = useId()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const close = () => { pinned.current = false; setOpen(false) }
  return <span className="nm-help-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned.current) setOpen(false) }}>
    <button ref={ref} type="button" className="nm-help" aria-label={`Explain ${label}`} aria-expanded={open} aria-describedby={open ? id : undefined} aria-controls={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={close} onClick={() => { pinned.current = !pinned.current; setOpen(pinned.current) }}>i</button>
    {open && <Popover anchor={ref} id={id} role="tooltip" onClose={close} className="nm-help-content"><strong>{label}</strong><p>{children}</p></Popover>}
  </span>
}
