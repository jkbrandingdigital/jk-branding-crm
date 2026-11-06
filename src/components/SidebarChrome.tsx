import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, MoreHorizontal, type LucideIcon } from 'lucide-react'

/*
  The bits of sidebar every layout shares.

  There are eight sidebars — admin, manager, sales, HR, design, dispatch,
  accounts, reception — and they are not the same shape: some fold their
  sections, some do not, and the sales one navigates by query string. What
  they do share is the narrow rail: the same width, the same button in the
  same corner, the same remembered choice. Written out eight times, those
  three facts would drift apart within a month, and a person moving between
  two screens would find the menu behaving differently on each.

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
  ── The bar along the bottom of a phone ──

  On a phone the sidebar was a button marked "Menu" at the top of the
  page: every single thing this app does was two taps away, and the first
  of those taps was in the corner furthest from a thumb. Somebody
  scanning in at the gate had to reach the top-left of the screen with
  one hand full.

  So the four things a person opens all day sit along the bottom, where
  the thumb already is, and everything else is behind "More" — which is
  the drawer that was already there. Nothing was taken away; it just
  stopped being the only way in.

  FOUR, and then More. Five slots is what fits at 360 px without the
  labels turning into stubs, and the fifth has to be More or the rest of
  the CRM has no door at all.

  Each layout decides its own four, because what a designer opens all day
  and what a receptionist opens all day are not the same list. The layout
  also works out `active` itself — sales navigates by query string, the
  rest by path, and this component should not have to know that.

  ── The bits that look fussy and are not ──

  `env(safe-area-inset-bottom)` is the strip at the bottom of a phone
  with a gesture bar. Without it the labels sit under the bar and the
  taps land on the home gesture instead of the button.

  `z-30`, under the drawer's `z-40`: More opens the drawer over the whole
  screen, and a bar painted on top of its own backdrop looks broken.

  Colours are class names, never a style attribute. The light theme sheet
  re-paints classes; it cannot reach inline colours, which is how an
  orange-on-orange row went invisible on cream once already.
*/
export type BottomItem = {
  label: string
  icon: LucideIcon
  to: string
  active: boolean
  /* A small dot on the icon — today's report is in, this one needs you. */
  dot?: boolean
}

export function BottomNav({
  items, onMore, moreActive = false,
}: {
  items: BottomItem[]
  onMore: () => void
  moreActive?: boolean
}) {
  const four = items.slice(0, 4)

  const cell = 'relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight'

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#1f1f1f] bg-[#121212] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {four.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.label} className="flex flex-1">
              <Link
                to={item.to}
                aria-current={item.active ? 'page' : undefined}
                className={`${cell} min-h-[56px] ${item.active ? 'text-orange-400' : 'text-gray-500'}`}
              >
                {/* The open page gets a stripe along the top of its slot.
                    Colour alone is not enough on a cream screen where the
                    whole bar is already warm. */}
                {item.active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-orange-500" />}
                <span className="relative">
                  <Icon size={21} strokeWidth={item.active ? 2.3 : 2} />
                  {item.dot && (
                    <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-[#121212]" />
                  )}
                </span>
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            </li>
          )
        })}

        <li className="flex flex-1">
          <button
            onClick={onMore}
            aria-label="More"
            aria-expanded={moreActive}
            className={`${cell} min-h-[56px] w-full ${moreActive ? 'text-orange-400' : 'text-gray-500'}`}
          >
            <MoreHorizontal size={21} strokeWidth={2} />
            <span className="w-full truncate text-center">More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

/*
  How much room the bar takes, for the page behind it.

  A page that does not reserve this ends with its last row — the Save
  button, the last task in the list — sitting under the bar, unreachable
  and with nothing to say it is there. On a desktop the bar is gone and
  the usual padding comes back.
*/
export const MAIN_PAD = 'px-4 py-6 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8 sm:pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-8'

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