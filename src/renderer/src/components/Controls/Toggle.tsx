import React, { useId } from 'react'
import { HelpTip } from './HelpTip'

export const Toggle: React.FC<{ on: boolean; onChange: (value: boolean) => void; label: string; sub?: string; help?: string; disabled?: boolean }> = ({ on, onChange, label, sub, help, disabled }) => {
  const id = useId()
  return <div className="nm-toggle-row"><div className="nm-toggle-copy"><div className="nm-field-label"><span id={id}>{label}</span>{help && <HelpTip label={label}>{help}</HelpTip>}</div>{sub && <p className="nm-field-note">{sub}</p>}</div>
    <button type="button" className={`nm-toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-labelledby={id} aria-checked={on} disabled={disabled}><span /></button>
  </div>
}
