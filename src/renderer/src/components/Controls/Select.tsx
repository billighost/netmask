import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { Popover } from './Popover'

export type SelectOption<T> = { value: T; label: string; description?: string; disabled?: boolean }

export function Select<T extends string | number>({ id, label, value, options, onChange, disabled = false }: {
  id: string
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const listId = useId()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const typeahead = useRef({ text: '', time: 0 })
  const chosen = options.find(option => option.value === value)
  useLayoutEffect(() => { if (open) document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' }) }, [active, open, listId])
  const show = () => { setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true) }
  const commit = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
  }
  const move = (step: number) => {
    for (let count = 1; count <= options.length; count++) {
      const index = (active + step * count + options.length) % options.length
      if (!options[index]?.disabled) { setActive(index); return }
    }
  }
  return <>
    <button ref={ref} id={id} type="button" className="nm-select" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${active}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()}
      onBlur={() => setOpen(false)} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
          event.preventDefault(); event.stopPropagation()
          if (!open) { show(); return }
          if (event.key === 'ArrowDown') move(1)
          else if (event.key === 'ArrowUp') move(-1)
          else if (event.key === 'Home') setActive(Math.max(0, options.findIndex(option => !option.disabled)))
          else if (event.key === 'End') { const index = options.map(option => !option.disabled).lastIndexOf(true); if (index >= 0) setActive(index) }
          else commit(active)
        } else if (event.key === 'Tab') setOpen(false)
        else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault(); event.stopPropagation()
          const now = Date.now()
          typeahead.current.text = (now - typeahead.current.time > 700 ? '' : typeahead.current.text) + event.key.toLowerCase()
          typeahead.current.time = now
          const index = options.findIndex(option => !option.disabled && option.label.toLowerCase().startsWith(typeahead.current.text))
          if (index >= 0) { setActive(index); setOpen(true) }
        }
      }}>
      <span>{chosen?.label || 'Choose an option'}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <Popover anchor={ref} id={listId} role="listbox" onClose={() => setOpen(false)} className="nm-select-menu" width={Math.max(190, ref.current?.getBoundingClientRect().width || 190)}>
      {options.map((option, index) => <div key={String(option.value)} id={`${listId}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        className={`nm-select-option${index === active ? ' is-active' : ''}`} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => commit(index)}>
        <div><span>{option.label}</span>{option.description && <small>{option.description}</small>}</div><span className="nm-option-check" aria-hidden="true">{option.value === value ? '✓' : ''}</span>
      </div>)}
    </Popover>}
  </>
}
