import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import { PLATFORM, type AccountStatus, type Platform } from '../../lib/digital'

// Small pieces the Digital screens share. Components only in this file —
// a file that also exports plain values stops Fast Refresh.

export function PlatformBadge({ platform, size = 'md' }: { platform: Platform; size?: 'sm' | 'md' }) {
  const p = PLATFORM[platform]
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold ${p.badge} ${
        size === 'sm' ? 'h-4 w-4 text-[8px]' : 'h-8 w-8 text-xs'
      }`}
      aria-label={p.label}
    >
      {p.short}
    </span>
  )
}

export function Avatar({ src, platform, name }: { src: string | null; platform: Platform; name: string }) {
  return (
    <span className="relative inline-block h-10 w-10 shrink-0">
      {src ? (
        <img src={src} alt="" className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#1f1f1f] text-sm font-semibold text-gray-300">
          {name.trim().slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#151515] p-[1px]">
        <PlatformBadge platform={platform} size="sm" />
      </span>
    </span>
  )
}

const STATUS: Record<AccountStatus, { label: string; cls: string }> = {
  connected:    { label: 'Connected',    cls: 'bg-green-950/60 text-green-400' },
  expired:      { label: 'Expired',      cls: 'bg-red-950/50 text-red-400' },
  paused:       { label: 'Paused',       cls: 'bg-amber-950/50 text-amber-300' },
  disconnected: { label: 'Disconnected', cls: 'bg-[#1f1f1f] text-gray-500' },
}

export function StatusChip({ status }: { status: AccountStatus }) {
  const s = STATUS[status]
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${s.cls}`}>{s.label}</span>
}

// Full screen on a phone, a dialog on a desktop. 100dvh, not 100vh (iOS).
export function Modal({
  title, sub, onClose, children, footer, wide = false,
}: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`flex max-h-[100dvh] w-full flex-col overflow-hidden bg-[#121212] sm:max-h-[92vh] sm:rounded-xl sm:border sm:border-[#2a2a2a] ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#222] bg-[#171717] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-white">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-[#222] px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{text}</p>
}
