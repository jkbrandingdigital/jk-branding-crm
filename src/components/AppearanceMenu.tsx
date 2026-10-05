import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Sun, Type } from 'lucide-react'
import {
  applyTextSize, applyTheme, getTextSize, getTheme,
  type TextSize, type Theme,
} from '../lib/appearance'

const SIZES: { key: TextSize; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'normal', label: 'Normal' },
  { key: 'large', label: 'Large' },
]

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [size, setSize] = useState<TextSize>(getTextSize)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function pickTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  function pickSize(s: TextSize) {
    setSize(s)
    applyTextSize(s)
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Appearance"
        title="Appearance"
        className="rounded-lg border border-[#2a2a2a] p-2.5 text-gray-300 transition-colors hover:border-[#3a3a3a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
      >
        {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
          <p className="border-b border-[#2a2a2a] px-4 py-2.5 text-sm font-medium text-white">Appearance</p>

          <div className="p-2">
            <p className="px-2 pb-1.5 text-xs text-gray-500">Theme</p>
            <div className="flex gap-1">
              <button
                onClick={() => pickTheme('light')}
                aria-pressed={theme === 'light'}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  theme === 'light' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-[#2a2a2a] text-gray-300 hover:text-white'
                }`}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                onClick={() => pickTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  theme === 'dark' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-[#2a2a2a] text-gray-300 hover:text-white'
                }`}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>
          </div>

          <div className="border-t border-[#2a2a2a] p-2">
            <p className="flex items-center gap-1.5 px-2 pb-1.5 text-xs text-gray-500">
              <Type className="h-3.5 w-3.5" /> Text size
            </p>
            <ul>
              {SIZES.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => pickSize(s.key)}
                    aria-pressed={size === s.key}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {size === s.key && <Check className="h-3.5 w-3.5 text-orange-400" />}
                    </span>
                    <span className="flex-1">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}