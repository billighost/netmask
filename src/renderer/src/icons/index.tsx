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
      d="M3 6.8a13 13 0 0 1 18 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Middle arc */}
    <path
      d="M6 10a8.5 8.5 0 0 1 12 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Inner arc */}
    <path
      d="M9 13.2a4.2 4.2 0 0 1 6 0"
      stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round"
    />
    {/* Eyelid contour */}
    <path
      d="M8.2 16.5 Q12 14.5 15.8 16.5"
      stroke="var(--accent-light, #38bdf8)" strokeWidth="1.3" strokeLinecap="round" fill="none"
    />
    <path
      d="M8.2 16.5 Q12 18.5 15.8 16.5"
      stroke="var(--accent-light, #38bdf8)" strokeWidth="1.3" strokeLinecap="round" fill="none"
    />
    {/* 5 Downward-pointing eyelashes matching the new logo */}
    <path
      d="M8.8 17.2 L7.5 19.8M10.4 17.8 L9.8 21M12 18 L12 21.8M13.6 17.8 L14.2 21M15.2 17.2 L16.5 19.8"
      stroke="var(--accent-light, #38bdf8)" strokeWidth="1.2" strokeLinecap="round"
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

export const EyeIcon = ({ size = 15, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const EyeOffIcon = ({ size = 15, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export const KeyboardIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2.5" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
  </svg>
)

export const GithubIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
)

export const MailIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
)

export const ExternalLinkIcon = ({ size = 14, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

export const UserIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

export const CheckmarkCircleIcon = ({ size = 16, color = 'currentColor', className = '' }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)



