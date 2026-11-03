import React from 'react'
import '../styles/icons.css'

interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * NetMaskLogoIcon — Wi-Fi arcs + closed eye (the app's signature mark)
 * The eye replaces the usual Wi-Fi dot, symbolising "masked / hidden identity"
 */
export const NetMaskLogoIcon = ({ size = 18, className = '' }: IconProps) => (
  <svg
    className={className}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Outer arc */}
    <path
      d="M2.5 8.8a13.5 13.5 0 0 1 19 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Middle arc */}
    <path
      d="M5.5 12a9 9 0 0 1 13 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Inner arc */}
    <path
      d="M8.5 15.2a4.5 4.5 0 0 1 7 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Closed eye — top lid */}
    <path
      d="M9.6 18.4 Q12 16.6 14.4 18.4"
      stroke="var(--text-primary)" strokeWidth="1.4" strokeLinecap="round" fill="none"
    />
    {/* Closed eye — bottom lid (flatter) */}
    <path
      d="M9.6 18.4 Q12 19.8 14.4 18.4"
      stroke="var(--text-primary)" strokeWidth="1.0" strokeLinecap="round" fill="none" opacity="0.5"
    />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   WifiIcon — arcs sweep in from dot, staggered
───────────────────────────────────────────────────────── */
export const WifiIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-wifi ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round"
  >
    <path className="arc arc-3" d="M2.5 8.5a13.5 13.5 0 0 1 19 0" />
    <path className="arc arc-2" d="M5.5 12a9 9 0 0 1 13 0" />
    <path className="arc arc-1" d="M8.5 15.5a4.5 4.5 0 0 1 7 0" />
    <circle className="dot" cx="12" cy="19" r="1.5" fill={color} stroke="none" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   RefreshIcon — arc rotates 360° with spring
───────────────────────────────────────────────────────── */
export const RefreshIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-refresh ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <g className="arrow">
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v5h-5" />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   GearIcon — rotates on hover
───────────────────────────────────────────────────────── */
export const GearIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-gear ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <g className="gear-body">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   ShieldIcon — checkmark draws on hover
───────────────────────────────────────────────────────── */
export const ShieldIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-shield ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
  >
    <path
      className="body"
      d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      className="check"
      d="M9 12l2 2 4-4"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   BoltIcon — lightning flashes on hover
───────────────────────────────────────────────────────── */
export const BoltIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-bolt ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
  >
    <path
      className="bolt-path"
      d="M13 2L4.5 13.5H11L11 22L19.5 10.5H13L13 2Z"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
    <line className="streak" x1="4" y1="13.5" x2="11" y2="13.5"
      stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   InfoIcon — "i" bounces up on hover
───────────────────────────────────────────────────────── */
export const InfoIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-info ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
  >
    <circle className="ring" cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.8" />
    <g className="i-char">
      <line x1="12" y1="11" x2="12" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.1" fill={color} />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   ArrowDownIcon — bounces downward on hover
───────────────────────────────────────────────────────── */
export const ArrowDownIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-arrow-down ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <g className="arrow-shape">
      <line x1="12" y1="4" x2="12" y2="18" />
      <polyline points="6 12 12 18 18 12" />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   ArrowUpIcon — bounces upward on hover
───────────────────────────────────────────────────────── */
export const ArrowUpIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-arrow-up ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <g className="arrow-shape">
      <line x1="12" y1="20" x2="12" y2="6" />
      <polyline points="6 12 12 6 18 12" />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   CheckIcon — path draws itself on hover
───────────────────────────────────────────────────────── */
export const CheckIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-check ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline className="check-path" points="4 12 9 17 20 7" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   CloseIcon — X lines have subtle rotation on hover
───────────────────────────────────────────────────────── */
export const CloseIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-x ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round"
  >
    <line className="x-line-1" x1="5" y1="5" x2="19" y2="19" />
    <line className="x-line-2" x1="19" y1="5" x2="5" y2="19" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   CopyIcon — back page shifts on hover
───────────────────────────────────────────────────────── */
export const CopyIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-copy ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
  >
    <rect className="copy-back" x="8" y="2" width="12" height="14" rx="2" />
    <rect x="3" y="8" width="12" height="14" rx="2" fill="var(--bg-surface-1, #111620)" />
    <rect x="3" y="8" width="12" height="14" rx="2" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   SunIcon — rays extend on hover
───────────────────────────────────────────────────────── */
export const SunIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-sun ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round"
  >
    <circle className="core" cx="12" cy="12" r="4.5" />
    <g className="ray">
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="19.1" y2="19.1" />
      <line x1="19.1" y1="4.9" x2="17.4" y2="6.6" />
      <line x1="6.6" y1="17.4" x2="4.9" y2="19.1" />
    </g>
  </svg>
)

/* ─────────────────────────────────────────────────────────
   MoonIcon — rotates and glows on hover
───────────────────────────────────────────────────────── */
export const MoonIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-moon ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
  >
    <path
      className="moon-shape"
      d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   EthernetIcon — RJ45 connector
───────────────────────────────────────────────────────── */
export const EthernetIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-ethernet ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
  >
    <rect x="5" y="7" width="14" height="10" rx="2" />
    <line x1="8" y1="7" x2="8" y2="4" />
    <line x1="11" y1="7" x2="11" y2="4" />
    <line x1="14" y1="7" x2="14" y2="4" />
    <line x1="16" y1="7" x2="16" y2="4" />
    <line x1="12" y1="17" x2="12" y2="20" />
    <line x1="9" y1="20" x2="15" y2="20" />
  </svg>
)

/* ─────────────────────────────────────────────────────────
   RestoreIcon — counter-clockwise spring rotation
───────────────────────────────────────────────────────── */
export const RestoreIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg
    className={`icon-restore ${className}`}
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <g className="restore-arrow">
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v5h5" />
    </g>
  </svg>
)

export const MinimizeIcon = ({ size = 12, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
    <line x1="2" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const MaximizeIcon = ({ size = 11, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
    <rect x="2" y="2" width="8" height="8" rx="1.5" stroke={color} strokeWidth="1.3" />
  </svg>
)

export const RestoreWindowIcon = ({ size = 11, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
    <rect x="4" y="2" width="6" height="6" rx="1" stroke={color} strokeWidth="1.2" />
    <path d="M2 4.5V9a1 1 0 0 0 1 1h4.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)

export const WindowCloseIcon = ({ size = 12, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
    <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const SearchIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
)

export const LockIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export const SparkleIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

export const DownloadIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

