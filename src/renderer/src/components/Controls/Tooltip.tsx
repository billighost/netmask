import React, { useId, useRef, useState } from 'react'
import { Popover } from './Popover'

export const Tooltip: React.FC<{ label: string; children: React.ReactElement }> = ({ label, children }) => {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  return <span ref={anchor} className="nm-tooltip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
    {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
    {open && <Popover anchor={anchor} id={id} role="tooltip" width={180} className="nm-tooltip" onClose={() => setOpen(false)}>{label}</Popover>}
  </span>
}
