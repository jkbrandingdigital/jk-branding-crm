// src/components/policies/MyPolicies.tsx
//
// The company's rules, as the person they apply to sees them.
// Route: /{role}/policies
//
// No permission gate, and that is deliberate. A rule somebody can be
// held to and cannot read is not a rule, it is a trap. Everyone gets
// this screen; what differs is which policies are on it, and that is
// decided in the database by policy_covers() — department, role, or
// named people — not here.
//
// Two things shape the layout.
//
// Unread first. A list in alphabetical order is a filing cabinet; the
// only question this screen exists to answer is "is there anything I
// have not read", so the answer sits at the top and says so.
//
// And the button lives at the END of the text, not beside the title.
// "I have read this" next to a heading is a lie waiting to be clicked.
// Putting it under the last paragraph means the person has at least
// had to travel the length of it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen, Check, AlertCircle, Calendar, Building2, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Policy = {
  id: string
  code: string
  title: string
  summary: string | null
  body: string
  version: number
  department: string | null
  effective_from: string | null
  must_read: boolean
  published_at: string | null
  updated_at: string
  read_this_version: boolean
  read_at: string | null
}

const day = (s: string | null) =>
  !s ? '—' : new Date(s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

export default function MyPolicies() {
  const [rows, setRows] = useState<Policy[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('my_policies')
      .select('id, code, title, summary, body, version, department, effective_from, must_read, published_at, updated_at, read_this_version, read_at')
    if (error) setErr(error.message)
    else {
      setErr(null)
      setRows((data ?? []) as Policy[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Unread must-reads, then unread optional ones, then everything read.
  // Within a group, newest first: a rule published this week is likelier
  // to be the one somebody came looking for.
  const sorted = useMemo(() => {
    const rank = (p: Policy) =>
      p.read_this_version ? 2 : p.must_read ? 0 : 1
    return [...rows].sort((a, b) =>
      rank(a) - rank(b) ||
      (b.published_at ?? '').localeCompare(a.published_at ?? ''))
  }, [rows])

  const unread = useMemo(
    () => rows.filter((p) => p.must_read && !p.read_this_version).length,
    [rows])

  // Nothing is open to begin with on a phone; on a wide screen the first
  // one opens, because an empty right-hand pane beside a list of titles
  // is a screen asking to be clicked rather than a screen answering.
  useEffect(() => {
    if (!openId && sorted.length && window.innerWidth >= 1024) {
      setOpenId(sorted[0].id)
    }
  }, [sorted, openId])

  const open = useMemo(
    () => rows.find((p) => p.id === openId) ?? null, [rows, openId])

  async function markRead(id: string) {
    setBusy(true)
    const { data, error } = await supabase.rpc('policy_mark_read', { p_policy: id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data && (data as { ok: boolean }).ok === false) {
      setErr((data as { reason?: string }).reason ?? 'That did not go through.')
      return
    }
    setErr(null)
    await load()
  }

  return (
    <div className="space-y-4">
      {/* ── The one thing this screen is for ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-400">
            <BookOpen size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-white">Company policy</h1>
            <p className="text-sm text-gray-400">
              {loading
                ? 'Looking…'
                : unread > 0
                  ? `${unread} ${unread === 1 ? 'policy needs' : 'policies need'} your acknowledgement`
                  : rows.length
                    ? 'You are up to date'
                    : 'Nothing has been published for you yet'}
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-400 hover:bg-[#1f1f1f] hover:text-white"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {/* ── The list ── */}
        <div className="space-y-2">
          {!loading && !rows.length && (
            <div className="rounded-xl border border-[#242424] bg-[#151515] p-6 text-center text-sm text-gray-400">
              No policy has been published for your department yet.
            </div>
          )}

          {sorted.map((p) => {
            const isOpen = p.id === openId
            const needs = p.must_read && !p.read_this_version
            return (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  isOpen
                    ? 'border-orange-500/40 bg-orange-500/10'
                    : 'border-[#242424] bg-[#151515] hover:bg-[#1f1f1f]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-white">{p.title}</span>
                  {needs ? (
                    <span className="shrink-0 rounded-full bg-amber-950/60 px-2 py-0.5 text-[11px] text-amber-300">
                      To read
                    </span>
                  ) : p.read_this_version ? (
                    <Check size={15} className="mt-0.5 shrink-0 text-green-400" />
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                  <span>{p.code}</span>
                  {p.department && (
                    <span className="flex items-center gap-1">
                      <Building2 size={11} /> {p.department}
                    </span>
                  )}
                  {p.version > 1 && <span>v{p.version}</span>}
                </div>
                {p.summary && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-gray-400">{p.summary}</p>
                )}
              </button>
            )
          })}
        </div>

        {/* ── The policy itself ── */}
        <div className="rounded-xl border border-[#242424] bg-[#151515]">
          {!open ? (
            <div className="p-10 text-center text-sm text-gray-500">
              Pick a policy to read it.
            </div>
          ) : (
            <article>
              <header className="border-b border-[#242424] p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5">{open.code}</span>
                  {open.department && <span>{open.department}</span>}
                  <span>Version {open.version}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white">{open.title}</h2>
                {open.summary && (
                  <p className="mt-1 text-sm text-gray-400">{open.summary}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  {open.effective_from && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> In force from {day(open.effective_from)}
                    </span>
                  )}
                  <span>Published {day(open.published_at)}</span>
                </div>
              </header>

              {/*
                The words. They are written by whoever holds policy_edit —
                the same people who can change the salary rules — so the
                HTML is the company's own, not a stranger's.
              */}
              <div
                className="policy-body space-y-3 p-5 text-sm leading-relaxed text-gray-300"
                dangerouslySetInnerHTML={{ __html: open.body || '<p>Nothing written yet.</p>' }}
              />

              {/* ── The acknowledgement, at the end where it belongs ── */}
              <footer className="border-t border-[#242424] p-5">
                {!open.must_read ? (
                  <p className="text-xs text-gray-500">
                    This one is for reference — no acknowledgement is asked for.
                  </p>
                ) : open.read_this_version ? (
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <Check size={16} />
                    You acknowledged this on {day(open.read_at)}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => void markRead(open.id)}
                      disabled={busy}
                      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-600 disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'I have read this'}
                    </button>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <AlertCircle size={13} />
                      Your name and the time are recorded against version {open.version}.
                    </span>
                  </div>
                )}
              </footer>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}