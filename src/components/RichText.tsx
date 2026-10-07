import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Eraser, Highlighter, Indent,
  Italic, Link2, List, ListOrdered, Outdent, Palette, Quote, Redo2, Strikethrough,
  Underline, Undo2, Unlink,
} from 'lucide-react'

/* ──────────────────────────────────────────────────────────────
   A small rich-text editor, written here so the CRM does not
   depend on an extra package. It keeps HTML, and everything that
   comes in or goes out is cleaned first.
   ────────────────────────────────────────────────────────────── */

// Tags we keep, with the attributes allowed on each
const ALLOWED: Record<string, string[]> = {
  P: ['style'], DIV: ['style'], BR: [], SPAN: ['style'],
  B: [], STRONG: [], I: [], EM: [], U: [], S: [], STRIKE: [], SUB: [], SUP: [],
  UL: [], OL: [], LI: ['style'],
  H1: ['style'], H2: ['style'], H3: ['style'],
  BLOCKQUOTE: ['style'], PRE: [], CODE: [],
  FONT: ['color', 'size', 'face'],
  A: ['href', 'target', 'rel'],
}
const SAFE_STYLE = /^(color|background-color|text-align|font-size|font-weight|font-style|text-decoration|text-decoration-line)$/
const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i

/** Strips anything we do not allow — scripts, event handlers, odd links. */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) walk(child)

    const allowed = ALLOWED[node.tagName]
    if (!allowed) {
      // Keep the words, drop the tag
      const parent = node.parentNode
      if (!parent) return
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
      return
    }

    for (const attr of Array.from(node.attributes)) {
      if (!allowed.includes(attr.name)) {
        node.removeAttribute(attr.name)
        continue
      }
      if (attr.name === 'style') {
        const keep = attr.value
          .split(';')
          .map((part) => part.trim())
          .filter((part) => {
            const prop = part.split(':')[0]?.trim().toLowerCase()
            return prop && SAFE_STYLE.test(prop) && !/url\s*\(|expression/i.test(part)
          })
        if (keep.length) node.setAttribute('style', keep.join('; '))
        else node.removeAttribute('style')
      }
      if (attr.name === 'href' && !SAFE_LINK.test(attr.value.trim())) node.removeAttribute('href')
    }

    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  }

  for (const child of Array.from(doc.body.children)) walk(child)
  return doc.body.innerHTML
}

/** The words only — for searching, previews and "is this empty?" checks. */
export function plainText(html: string): string {
  if (!html) return ''
  if (!/[<&]/.test(html)) return html
  const doc = new DOMParser().parseFromString(
    `<body>${html.replace(/<(br|\/p|\/div|\/li|\/h[1-3])\s*\/?>/gi, ' $& ')}</body>`,
    'text/html',
  )
  return (doc.body.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

export const isEmptyHtml = (html: string) => plainText(html).length === 0 && !/<img/i.test(html ?? '')

const HAS_TAGS = /<[a-z][\s\S]*>/i

/** Older notes were saved as plain text — their line breaks are kept. */
export function toHtml(value: string | null | undefined): string {
  if (!value) return ''
  if (HAS_TAGS.test(value)) return sanitizeHtml(value)
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/* ── Reading side: shows saved HTML, cleaned ─────────────────── */

export function RichHtml({ html, className = '' }: { html: string | null | undefined; className?: string }) {
  if (!html || isEmptyHtml(html)) return <span className="text-gray-500">—</span>
  return <div className={`jk-rich ${className}`} dangerouslySetInnerHTML={{ __html: toHtml(html) }} />
}

/* ── Writing side ────────────────────────────────────────────── */

// Greys that read on both the light and the dark screen; white and black sit at the ends
const TEXT_COLORS = ['#6b7280', '#9ca3af', '#FF5E00', '#f59e0b', '#16a34a', '#0ea5e9', '#7c3aed', '#dc2626', '#111111', '#ffffff']
const MARK_COLORS = ['transparent', '#FF5E00', '#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#ef4444']
const SIZES = [
  { v: '2', label: 'Small' },
  { v: '3', label: 'Normal' },
  { v: '5', label: 'Large' },
  { v: '6', label: 'Huge' },
]
const BLOCKS = [
  { v: 'p', label: 'Paragraph' },
  { v: 'h1', label: 'Heading 1' },
  { v: 'h2', label: 'Heading 2' },
  { v: 'h3', label: 'Heading 3' },
  { v: 'pre', label: 'Code block' },
]

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  id?: string
  disabled?: boolean
}

export function RichText({ value, onChange, placeholder = 'Write here…', minHeight = 170, id, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mine = useRef(value)
  const [on, setOn] = useState<Record<string, boolean>>({})
  const [pick, setPick] = useState<'color' | 'mark' | 'link' | null>(null)
  const [href, setHref] = useState('')

  // First paint: put the saved text in
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = toHtml(value)
    try {
      document.execCommand('styleWithCSS', false, 'true')
    } catch {
      /* older browsers colour with <font>, which we also accept */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Later changes from outside (a different task opened, say)
  useEffect(() => {
    if (!ref.current) return
    if (value !== mine.current) {
      ref.current.innerHTML = toHtml(value)
      mine.current = value
    }
  }, [value])

  // Light up the buttons that apply where the cursor is
  useEffect(() => {
    const read = () => {
      const el = ref.current
      if (!el || !document.activeElement || !el.contains(document.activeElement)) return
      const q = (c: string) => {
        try {
          return document.queryCommandState(c)
        } catch {
          return false
        }
      }
      setOn({
        bold: q('bold'), italic: q('italic'), underline: q('underline'), strikeThrough: q('strikeThrough'),
        insertUnorderedList: q('insertUnorderedList'), insertOrderedList: q('insertOrderedList'),
        justifyLeft: q('justifyLeft'), justifyCenter: q('justifyCenter'), justifyRight: q('justifyRight'), justifyFull: q('justifyFull'),
      })
    }
    document.addEventListener('selectionchange', read)
    return () => document.removeEventListener('selectionchange', read)
  }, [])

  function emit() {
    const html = ref.current?.innerHTML ?? ''
    mine.current = html
    onChange(html)
  }

  function exec(cmd: string, val?: string) {
    if (disabled) return
    ref.current?.focus()
    try {
      document.execCommand(cmd, false, val)
    } catch {
      /* nothing to do — the text is simply left as it was */
    }
    emit()
  }

  function addLink() {
    const url = href.trim()
    setPick(null)
    setHref('')
    if (!url) return
    exec('createLink', SAFE_LINK.test(url) ? url : `https://${url}`)
  }

  // Paste arrives cleaned, so nothing from Word or a website leaks in
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html))
    else document.execCommand('insertText', false, text)
    emit()
  }

  const btn = (active?: boolean) =>
    `flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
      active ? 'bg-orange-500/20 text-orange-400' : 'text-gray-400 hover:bg-[#242424] hover:text-white'
    }`
  const sep = <span className="mx-1 h-5 w-px bg-[#2a2a2a]" />
  const sel = 'rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-gray-300 focus:border-orange-500 focus:outline-none'

  return (
    <div className={`overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] focus-within:border-orange-500 ${disabled ? 'opacity-60' : ''}`}>
      <style>{`
        .jk-edit:empty:before { content: attr(data-ph); color: rgba(127,127,127,.85); }
        .jk-rich a, .jk-edit a { color: #FF5E00; text-decoration: underline; }
        .jk-rich ul, .jk-edit ul { list-style: disc; padding-left: 1.4rem; }
        .jk-rich ol, .jk-edit ol { list-style: decimal; padding-left: 1.4rem; }
        .jk-rich h1, .jk-edit h1 { font-size: 1.5rem; font-weight: 600; margin: .4rem 0; }
        .jk-rich h2, .jk-edit h2 { font-size: 1.25rem; font-weight: 600; margin: .4rem 0; }
        .jk-rich h3, .jk-edit h3 { font-size: 1.1rem; font-weight: 600; margin: .3rem 0; }
        .jk-rich blockquote, .jk-edit blockquote { border-left: 3px solid #FF5E00; padding-left: .75rem; margin: .4rem 0; opacity: .85; }
        .jk-rich pre, .jk-edit pre { background: rgba(127,127,127,.14); border-radius: .5rem; padding: .6rem .8rem; overflow-x: auto; font-size: .85em; }
        .jk-rich p, .jk-edit p { margin: .25rem 0; }
        .jk-rich img, .jk-edit img { max-width: 100%; }
      `}</style>

      {/* Toolbar. Buttons must not steal focus, or the selected words are lost */}
      <div
        onMouseDown={(e) => {
          const tag = (e.target as HTMLElement).tagName
          if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault()
        }}
        className="relative flex flex-wrap items-center gap-0.5 border-b border-[#242424] bg-[#171717] px-2 py-1.5"
      >
        <select
          onChange={(e) => { exec('formatBlock', `<${e.target.value}>`); e.currentTarget.selectedIndex = 0 }}
          className={sel}
          aria-label="Text style"
          defaultValue=""
        >
          <option value="" disabled>Style</option>
          {BLOCKS.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}
        </select>
        <select
          onChange={(e) => { exec('fontSize', e.target.value); e.currentTarget.selectedIndex = 0 }}
          className={`${sel} ml-1`}
          aria-label="Text size"
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>

        {sep}
        <button type="button" onClick={() => exec('bold')} className={btn(on.bold)} title="Bold" aria-label="Bold"><Bold size={15} /></button>
        <button type="button" onClick={() => exec('italic')} className={btn(on.italic)} title="Italic" aria-label="Italic"><Italic size={15} /></button>
        <button type="button" onClick={() => exec('underline')} className={btn(on.underline)} title="Underline" aria-label="Underline"><Underline size={15} /></button>
        <button type="button" onClick={() => exec('strikeThrough')} className={btn(on.strikeThrough)} title="Strikethrough" aria-label="Strikethrough"><Strikethrough size={15} /></button>

        {sep}
        <button type="button" onClick={() => setPick(pick === 'color' ? null : 'color')} className={btn(pick === 'color')} title="Text colour" aria-label="Text colour"><Palette size={15} /></button>
        <button type="button" onClick={() => setPick(pick === 'mark' ? null : 'mark')} className={btn(pick === 'mark')} title="Highlight" aria-label="Highlight"><Highlighter size={15} /></button>

        {sep}
        <button type="button" onClick={() => exec('insertUnorderedList')} className={btn(on.insertUnorderedList)} title="Bulleted list" aria-label="Bulleted list"><List size={15} /></button>
        <button type="button" onClick={() => exec('insertOrderedList')} className={btn(on.insertOrderedList)} title="Numbered list" aria-label="Numbered list"><ListOrdered size={15} /></button>
        <button type="button" onClick={() => exec('outdent')} className={btn()} title="Less indent" aria-label="Less indent"><Outdent size={15} /></button>
        <button type="button" onClick={() => exec('indent')} className={btn()} title="More indent" aria-label="More indent"><Indent size={15} /></button>

        {sep}
        <button type="button" onClick={() => exec('justifyLeft')} className={btn(on.justifyLeft)} title="Align left" aria-label="Align left"><AlignLeft size={15} /></button>
        <button type="button" onClick={() => exec('justifyCenter')} className={btn(on.justifyCenter)} title="Centre" aria-label="Centre"><AlignCenter size={15} /></button>
        <button type="button" onClick={() => exec('justifyRight')} className={btn(on.justifyRight)} title="Align right" aria-label="Align right"><AlignRight size={15} /></button>
        <button type="button" onClick={() => exec('justifyFull')} className={btn(on.justifyFull)} title="Justify" aria-label="Justify"><AlignJustify size={15} /></button>

        {sep}
        <button type="button" onClick={() => exec('formatBlock', '<blockquote>')} className={btn()} title="Quote" aria-label="Quote"><Quote size={15} /></button>
        <button type="button" onClick={() => setPick(pick === 'link' ? null : 'link')} className={btn(pick === 'link')} title="Add link" aria-label="Add link"><Link2 size={15} /></button>
        <button type="button" onClick={() => exec('unlink')} className={btn()} title="Remove link" aria-label="Remove link"><Unlink size={15} /></button>

        {sep}
        <button type="button" onClick={() => exec('undo')} className={btn()} title="Undo" aria-label="Undo"><Undo2 size={15} /></button>
        <button type="button" onClick={() => exec('redo')} className={btn()} title="Redo" aria-label="Redo"><Redo2 size={15} /></button>
        <button type="button" onClick={() => exec('removeFormat')} className={btn()} title="Clear formatting" aria-label="Clear formatting"><Eraser size={15} /></button>

        {/* Colour / link pickers */}
        {pick === 'color' && (
          <div className="absolute left-2 top-full z-20 mt-1 flex w-56 flex-wrap gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#191919] p-2 shadow-xl">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setPick(null); exec('foreColor', c) }}
                aria-label={`Colour ${c}`}
                className="h-6 w-6 rounded-full border border-[#3a3a3a]"
                style={{ background: c }}
              />
            ))}
          </div>
        )}
        {pick === 'mark' && (
          <div className="absolute left-2 top-full z-20 mt-1 flex w-56 flex-wrap gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#191919] p-2 shadow-xl">
            {MARK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setPick(null); exec('hiliteColor', c) }}
                aria-label={`Highlight ${c}`}
                className="h-6 w-6 rounded-full border border-[#3a3a3a]"
                style={{ background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#333 0 4px,#555 4px 8px)' : c }}
              />
            ))}
          </div>
        )}
        {pick === 'link' && (
          <div className="absolute left-2 top-full z-20 mt-1 flex w-72 gap-2 rounded-lg border border-[#2a2a2a] bg-[#191919] p-2 shadow-xl">
            <input
              autoFocus
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLink()}
              placeholder="https://…"
              className="flex-1 rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <button type="button" onClick={addLink} className="rounded-md bg-orange-500 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600">
              Add
            </button>
          </div>
        )}
      </div>

      {/* The paper */}
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label="Description"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        style={{ minHeight }}
        className="jk-edit max-h-80 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-white focus:outline-none"
      />
    </div>
  )
}

export default RichText