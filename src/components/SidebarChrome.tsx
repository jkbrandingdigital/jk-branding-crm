import { useEffect, useState } from 'react'
import { Menu, type LucideIcon } from 'lucide-react'

/*
  The bits of sidebar every layout shares.

  There are five sidebars — admin, sales, HR, manager, design — and they
  are not the same shape: some fold their sections, some do not, and the
  sales one navigates by query string. What they do share is the narrow
  rail: the same width, the same button in the same corner, the same
  remembered choice. Written out five times, those three facts would drift
  apart within a month, and a person moving between two screens would find
  the menu behaving differently on each.

  So the shape stays with each layout, and only the chrome lives here.
*/

const KEY = 'jk_sidebar_collapsed'

/*
  Narrowed or not, remembered per browser.

  Somebody who works narrow should not have to say so every morning, and
  the setting is a preference rather than data — losing it in a private
  window costs nothing, so a failed read just means "wide".
*/
export function useCollapsedSidebar(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0') } catch { /* private window */ }
  }, [collapsed])

  return [collapsed, setCollapsed]
}

// Widths, so the rail and the panel it pushes never disagree
export const SIDEBAR_W = { narrow: 'w-16', wide: 'w-60' }

/*
  The narrow / wide button.

  The same icon in both states, in the same corner. A pair of arrows that
  flip direction asks to be read; a menu icon is one thing everybody
  already knows, and leaving it put means the way back is where the way
  out was.
*/
export function SidebarToggle({ narrow, onToggle }: { narrow: boolean; onToggle: () => void }) {
  return (
    <div className={`hidden pt-3 lg:flex ${narrow ? 'justify-center px-2' : 'justify-end px-3'}`}>
      <button
        onClick={onToggle}
        title={narrow ? 'Open the menu' : 'Narrow the menu'}
        aria-label={narrow ? 'Open the menu' : 'Narrow the menu'}
        aria-expanded={!narrow}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#1a1a1a] hover:text-white"
      >
        <Menu size={20} />
      </button>
    </div>
  )
}

/*
  One colour for every menu icon — the CRM's own orange.

  A colour each was tried first and read as decoration: nine hues down
  one column, none of them meaning anything, so the eye had nothing to
  rest on.

  Since the icons are orange too, "you are here" cannot be carried by
  hue alone any more. It is carried by weight instead: the open page's
  square is brighter and its icon paler, so the active row still steps
  forward out of a column of the same colour.
*/
export const NAV_TINT = '#f97316'

/*
  A menu icon in its own tinted square.

  On its own a line icon against a dark panel is thin and easy to miss.
  The square gives it a body — which matters most in the narrow rail,
  where the label is gone and the icon is all there is to aim at.

  ── Why variables and not plain colours ──

  The four colours below used to be written here as hex. An inline style
  is the last word in CSS: the light-theme sheet re-paints class names,
  and a style attribute is not a class name, so nothing it said could
  reach this square. Dark was built first, so on paper the open page's
  icon stayed the pale peach meant for a black panel — invisible on
  cream, and the one row a person most needs to find.

  So the colours are named here and decided in the sheet, which already
  knows which theme is on. Dark's own values sit in the fallbacks, so
  this file still looks right if the variables are ever missing.
*/
export function NavIcon({
  icon: Icon, active = false, narrow = false, muted = false,
}: {
  icon: LucideIcon
  active?: boolean
  narrow?: boolean
  muted?: boolean
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg transition-colors ${narrow ? 'h-9 w-9' : 'h-8 w-8'}`}
      style={{
        background: active
          ? 'var(--nav-ico-bg-on, rgba(249,115,22,0.30))'
          : 'var(--nav-ico-bg, rgba(249,115,22,0.12))',
        color: active
          ? 'var(--nav-ico-on, #fed7aa)'
          : muted
            ? 'var(--nav-ico-off, #4b5563)'
            : 'var(--nav-ico, #f97316)',
        boxShadow: active ? 'var(--nav-ico-ring, none)' : 'none',
      }}
    >
      <Icon size={narrow ? 20 : 18} strokeWidth={2} />
    </span>
  )
}