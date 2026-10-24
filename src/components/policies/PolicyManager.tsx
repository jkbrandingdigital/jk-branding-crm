// src/components/policies/PolicyManager.tsx
//
// Writing the company's rules, and seeing who has read them.
// Routes: /hr/policies-manage and /admin/policies-manage
//
// Reading is open to everyone (MyPolicies). Writing needs policy_edit,
// and the page guards itself rather than trusting the route — the same
// reason every other screen here does.
//
// ── Why "12 read" is always shown as "12 of 22" ──
//
// A bare count is unreadable: twelve out of a company of ninety is a
// problem, twelve out of twelve is finished, and the number is the same.
// The denominator comes from policy_due_count() in the database — the
// SAME rule that decides who the policy reaches — so the two can never
// disagree. Typing a target in beside it would have given HR a figure
// that quietly goes stale the day somebody joins.
//
// ── Why editing a live policy is announced ──
//
// Changing the words of a published policy raises its version, and
// every acknowledgement against the old version stops counting. That is
// correct — people signed off on text that no longer exists — but it is
// a large thing to happen silently, so the screen says so before and
// confirms after.
//
// The editor is a plain contentEditable with a short toolbar. It writes
// the same HTML the rest of the CRM stores, and keeping it here means
// this screen has no dependency to break when the shared editor moves.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen, Plus, Users, Eye, EyeOff, Trash2, Check, X, Search,
  Bold, Italic, List, Heading, AlertCircle, RefreshCw, Save,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'

type Row = {
  id: string; code: string; title: string; version: number
  is_published: boolean; must_read: boolean
  effective_from: string | null; updated_at: string; published_at: string | null
  summary: string | null; department_id: string | null; department: string | null
  due_now: number; read_now: number; read_ever: number
}

type Dept = { id: string; name: string; for_role: string | null; sort_no: number }
type Person = { id: string; full_name: string; emp_code: string | null }
type Reader = {
  user_id: string; full_name: string; emp_code: string | null
  branch: string | null; has_read: boolean; read_at: string | null
}

type Draft = {
  id: string | null
  title: string
  department_id: string
  summary: string
  body: string
  effective_from: string
  must_read: boolean
  is_published: boolean
  version: number
  audience: string[]
}

const EMPTY: Draft = {
  id: null, title: '', department_id: '', summary: '', body: '',
  effective_from: '', must_read: true, is_published: false, version: 1, audience: [],
}

const day = (s: string | null) =>
  !s ? '—' : new Date(s).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

export default function PolicyManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [staff, setStaff] = useState<Person[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [tab, setTab] = useState<'all' | 'live' | 'draft' | 'behind'>('all')
  const [q, setQ] = useState('')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [readersFor, setReadersFor] = useState<Row | null>(null)
  const [readers, setReaders] = useState<Reader[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b, c, d] = await Promise.all([
      supabase.from('policy_read_counts')
        .select('id, code, title, version, is_published, must_read, effective_from, updated_at, published_at, summary, department_id, department, due_now, read_now, read_ever'),
      supabase.rpc('policy_departments_list'),
      supabase.from('profiles').select('id, full_name, emp_code').eq('is_active', true).order('full_name'),
      supabase.rpc('can_edit_policy'),
    ])
    if (a.error) setErr(a.error.message)
    else setRows((a.data ?? []) as Row[])
    setDepts((b.data ?? []) as Dept[])
    setStaff((c.data ?? []) as Person[])
    setAllowed(d.data === true)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const tiles = useMemo(() => {
    const live = rows.filter((r) => r.is_published)
    const behind = live.filter((r) => r.must_read && r.read_now < r.due_now)
    return {
      all: rows.length,
      live: live.length,
      draft: rows.length - live.length,
      behind: behind.length,
    }
  }, [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) =>
        tab === 'all' ? true
          : tab === 'live' ? r.is_published
            : tab === 'draft' ? !r.is_published
              : r.is_published && r.must_read && r.read_now < r.due_now)
      .filter((r) => !needle
        || r.title.toLowerCase().includes(needle)
        || r.code.toLowerCase().includes(needle)
        || (r.department ?? '').toLowerCase().includes(needle))
      .sort((x, y) =>
        Number(y.is_published) - Number(x.is_published) ||
        (y.updated_at ?? '').localeCompare(x.updated_at ?? ''))
  }, [rows, tab, q])

  // ── Opening one ──
  async function openPolicy(id: string | null) {
    setErr(null); setNote(null)
    if (!id) { setDraft({ ...EMPTY }); return }
    const { data, error } = await supabase.rpc('policy_get', { p_id: id })
    if (error) { setErr(error.message); return }
    const r = data as {
      ok: boolean; reason?: string
      policy?: Record<string, unknown>; audience?: string[]
    }
    if (!r.ok) { setErr(r.reason ?? 'Could not open it.'); return }
    const p = r.policy ?? {}
    setDraft({
      id: String(p.id ?? ''),
      title: String(p.title ?? ''),
      department_id: p.department_id ? String(p.department_id) : '',
      summary: p.summary ? String(p.summary) : '',
      body: String(p.body ?? ''),
      effective_from: p.effective_from ? String(p.effective_from) : '',
      must_read: p.must_read !== false,
      is_published: p.is_published === true,
      version: Number(p.version ?? 1),
      audience: (r.audience ?? []).map(String),
    })
  }

  async function save() {
    if (!draft) return
    setBusy(true); setErr(null); setNote(null)
    const { data, error } = await supabase.rpc('policy_save', {
      p_id: draft.id,
      p_title: draft.title,
      p_dept: draft.department_id || null,
      p_body: draft.body,
      p_summary: draft.summary || null,
      p_from: draft.effective_from || null,
      p_must_read: draft.must_read,
    })
    if (error) { setBusy(false); setErr(error.message); return }
    const r = data as { ok: boolean; reason?: string; id?: string; version?: number; version_raised?: boolean }
    if (!r.ok) { setBusy(false); setErr(r.reason ?? 'Not saved.'); return }

    // The named-people list is a separate table, so it is written after
    // the policy exists — a new one has no id until the line above.
    const id = r.id ?? draft.id
    if (id) {
      await supabase.rpc('policy_audience_set', { p_policy: id, p_users: draft.audience })
    }
    setBusy(false)
    setNote(r.version_raised
      ? `Saved as version ${r.version}. Because the words changed, everyone has been asked to read it again.`
      : 'Saved.')
    await load()
    if (id) await openPolicy(id)
  }

  async function publish(id: string, on: boolean) {
    setBusy(true); setErr(null); setNote(null)
    const { data, error } = await supabase.rpc('policy_publish', { p_id: id, p_on: on })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = data as { ok: boolean; reason?: string; reaches?: number }
    if (!r.ok) { setErr(r.reason ?? 'Not done.'); return }
    setNote(on ? `It is out. ${r.reaches} people will be asked to read it.` : 'Taken down.')
    await load()
    if (draft?.id === id) await openPolicy(id)
  }

  async function drop(id: string) {
    setBusy(true); setErr(null); setNote(null)
    const { data, error } = await supabase.rpc('policy_drop', { p_id: id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = data as { ok: boolean; reason?: string }
    if (!r.ok) { setErr(r.reason ?? 'Not deleted.'); return }
    setDraft(null)
    setNote('Deleted.')
    await load()
  }

  async function showReaders(row: Row) {
    setReadersFor(row); setReaders([])
    const { data, error } = await supabase.rpc('policy_readers', { p_policy: row.id })
    if (error) { setErr(error.message); return }
    setReaders((data ?? []) as Reader[])
  }

  if (allowed === false) {
    return (
      <div className="rounded-xl border border-[#242424] bg-[#151515] p-8 text-center">
        <p className="text-sm text-gray-400">
          You can read the company policies, but not write them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Head ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-400">
            <BookOpen size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-white">Company policy</h1>
            <p className="text-sm text-gray-400">
              Write the rules, publish them, and see who has read them.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-400 hover:bg-[#1f1f1f] hover:text-white"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={() => void openPolicy(null)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-600"
          >
            <Plus size={16} /> New policy
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {err}
        </div>
      )}
      {note && (
        <div className="rounded-lg border border-green-900/40 bg-green-950/20 px-3 py-2 text-sm text-green-300">
          {note}
        </div>
      )}

      {/* ── Tiles, which are also the filter ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['all', 'All policies', tiles.all, 'text-white'],
          ['live', 'Published', tiles.live, 'text-green-400'],
          ['draft', 'Drafts', tiles.draft, 'text-gray-300'],
          ['behind', 'Not read by everyone', tiles.behind, 'text-amber-300'],
        ] as const).map(([key, label, n, tone]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              tab === key
                ? 'border-orange-500/40 bg-orange-500/10'
                : 'border-[#242424] bg-[#151515] hover:bg-[#1f1f1f]'
            }`}
          >
            <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
            <div className="mt-0.5 text-xs text-gray-400">{label}</div>
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3">
        <Search size={15} className="text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, code or department"
          className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-gray-600"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-gray-500 hover:text-white">
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── The list ── */}
      <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1a1a1a] text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 font-medium">Policy</th>
              <th className="px-4 py-3 font-medium">For</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Read</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f1f]">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Looking…</td></tr>
            )}
            {!loading && !shown.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                {rows.length ? 'Nothing matches that.' : 'No policy has been written yet.'}
              </td></tr>
            )}
            {shown.map((r) => {
              const pct = r.due_now ? Math.round((r.read_now / r.due_now) * 100) : 0
              return (
                <tr key={r.id} className="hover:bg-[#1a1a1a]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void openPolicy(r.id)}
                      className="text-left font-medium text-white hover:text-orange-400"
                    >
                      {r.title}
                    </button>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {r.code}{r.version > 1 ? ` · v${r.version}` : ''}
                      {r.effective_from ? ` · from ${day(r.effective_from)}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{r.department ?? 'Everybody'}</td>
                  <td className="px-4 py-3">
                    {r.is_published ? (
                      <span className="rounded-full bg-green-950/60 px-2 py-0.5 text-[11px] text-green-300">
                        Published
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-[11px] text-gray-400">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!r.is_published ? (
                      <span className="text-xs text-gray-600">—</span>
                    ) : !r.must_read ? (
                      <span className="text-xs text-gray-500">Not asked for</span>
                    ) : (
                      <div className="w-32">
                        <div className="flex items-baseline justify-between text-xs">
                          <span className={r.read_now >= r.due_now ? 'text-green-400' : 'text-amber-300'}>
                            {r.read_now} of {r.due_now}
                          </span>
                          <span className="text-gray-600">{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#242424]">
                          <div
                            className={`h-full rounded-full ${r.read_now >= r.due_now ? 'bg-green-500' : 'bg-orange-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {r.is_published && (
                        <button
                          onClick={() => void showReaders(r)}
                          title="Who has read it"
                          className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white"
                        >
                          <Users size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => void publish(r.id, !r.is_published)}
                        disabled={busy}
                        title={r.is_published ? 'Take it down' : 'Publish it'}
                        className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white disabled:opacity-40"
                      >
                        {r.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {draft && (
        <Editor
          draft={draft}
          depts={depts}
          staff={staff}
          busy={busy}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void save()}
          onPublish={(on) => draft.id && void publish(draft.id, on)}
          onDrop={() => draft.id && void drop(draft.id)}
        />
      )}

      {readersFor && (
        <ReaderList
          row={readersFor}
          readers={readers}
          onClose={() => setReadersFor(null)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   The editor
   ══════════════════════════════════════════════════════════════ */

function Editor({
  draft, depts, staff, busy, onChange, onClose, onSave, onPublish, onDrop,
}: {
  draft: Draft
  depts: Dept[]
  staff: Person[]
  busy: boolean
  onChange: (d: Draft) => void
  onClose: () => void
  onSave: () => void
  onPublish: (on: boolean) => void
  onDrop: () => void
}) {
  const [confirmDrop, setConfirmDrop] = useState(false)
  const [pickPeople, setPickPeople] = useState(false)
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-[#242424] bg-[#151515]">
        <header className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">
              {draft.id ? 'Edit policy' : 'New policy'}
            </h2>
            {draft.id && (
              <p className="text-xs text-gray-500">
                Version {draft.version} · {draft.is_published ? 'published' : 'draft'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* The warning that matters most on this screen. */}
          {draft.is_published && (
            <div className="flex gap-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>
                This one is already out. If you change the <strong>words</strong>, it
                becomes version {draft.version + 1} and everyone is asked to read it
                again. Fixing the title or the summary does not.
              </span>
            </div>
          )}

          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Leave and attendance rules"
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-orange-500"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who it is for">
              <select
                value={draft.department_id}
                onChange={(e) => set({ department_id: e.target.value })}
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
              >
                <option value="">Everybody</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>

            <Field label="In force from">
              <DateField
                value={draft.effective_from}
                onChange={(v) => set({ effective_from: v ?? '' })}
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="One line for the list">
            <input
              value={draft.summary}
              onChange={(e) => set({ summary: e.target.value })}
              placeholder="What this covers, in a few words"
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-orange-500"
            />
          </Field>

          <Field label="The policy">
            <RichText value={draft.body} onChange={(v) => set({ body: v })} />
          </Field>

          {/* Acknowledgement */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
            <input
              type="checkbox"
              checked={draft.must_read}
              onChange={(e) => set({ must_read: e.target.checked })}
              className="mt-0.5 accent-orange-500"
            />
            <span className="text-sm">
              <span className="text-white">Ask people to acknowledge it</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Leave this off for reference material. Only must-read policies
                are counted and chased.
              </span>
            </span>
          </label>

          {/* Named people, on top of the department */}
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white">Also send it to specific people</div>
                <div className="text-xs text-gray-500">
                  {draft.audience.length
                    ? `${draft.audience.length} named, on top of the department above`
                    : 'For what a department does not describe'}
                </div>
              </div>
              <button
                onClick={() => setPickPeople((v) => !v)}
                className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
              >
                {pickPeople ? 'Done' : 'Choose'}
              </button>
            </div>

            {pickPeople && (
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[#242424] p-2">
                {staff.map((p) => {
                  const on = draft.audience.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#1f1f1f]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => set({
                          audience: on
                            ? draft.audience.filter((x) => x !== p.id)
                            : [...draft.audience, p.id],
                        })}
                        className="accent-orange-500"
                      />
                      <span className="text-gray-300">{p.full_name}</span>
                      {p.emp_code && (
                        <span className="text-[11px] text-gray-600">{p.emp_code}</span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#242424] px-5 py-4">
          <div className="flex items-center gap-2">
            {draft.id && (
              confirmDrop ? (
                <>
                  <span className="text-xs text-gray-400">Delete it for good?</span>
                  <button
                    onClick={onDrop}
                    className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDrop(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDrop(true)}
                  className="flex items-center gap-1.5 rounded-lg p-2 text-xs text-gray-500 hover:text-red-300"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            {draft.id && (
              <button
                onClick={() => onPublish(!draft.is_published)}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white disabled:opacity-40"
              >
                {draft.is_published ? <EyeOff size={15} /> : <Eye size={15} />}
                {draft.is_published ? 'Take it down' : 'Publish'}
              </button>
            )}
            <button
              onClick={onSave}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-600 disabled:opacity-50"
            >
              <Save size={15} /> {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-gray-400">{label}</label>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   A small rich text box

   contentEditable with four buttons. The value is pushed in only when
   it differs from what the box already holds — writing it back on every
   keystroke would move the caret to the end of the text after each
   letter, which makes the box unusable in exactly the way that is hard
   to describe in a bug report.
   ══════════════════════════════════════════════════════════════ */

function RichText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value || ''
  }, [value])

  const cmd = (name: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }

  const Btn = ({ icon: Icon, name, arg, title }: {
    icon: typeof Bold; name: string; arg?: string; title: string
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); cmd(name, arg) }}
      className="rounded p-1.5 text-gray-400 hover:bg-[#242424] hover:text-white"
    >
      <Icon size={15} />
    </button>
  )

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
      <div className="flex items-center gap-1 border-b border-[#242424] px-2 py-1.5">
        <Btn icon={Bold} name="bold" title="Bold" />
        <Btn icon={Italic} name="italic" title="Italic" />
        <Btn icon={List} name="insertUnorderedList" title="Bulleted list" />
        <Btn icon={Heading} name="formatBlock" arg="<h3>" title="Heading" />
        <span className="ml-auto text-[11px] text-gray-600">
          Write it as you want people to read it
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="policy-body min-h-[12rem] px-3 py-3 text-sm leading-relaxed text-gray-200 outline-none"
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Who has read it

   Unread first, because that is the list HR acts on. The read ones stay
   on the screen rather than being hidden behind a tab, so "everybody"
   can be seen to be everybody.
   ══════════════════════════════════════════════════════════════ */

function ReaderList({
  row, readers, onClose,
}: { row: Row; readers: Reader[]; onClose: () => void }) {
  const notYet = readers.filter((r) => !r.has_read)
  const done = readers.filter((r) => r.has_read)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="my-6 w-full max-w-lg rounded-2xl border border-[#242424] bg-[#151515]">
        <header className="flex items-start justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">{row.title}</h2>
            <p className="text-xs text-gray-500">
              {row.read_now} of {row.due_now} have acknowledged version {row.version}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {!readers.length && (
            <p className="py-6 text-center text-sm text-gray-500">Looking…</p>
          )}

          {notYet.length > 0 && (
            <>
              <div className="mb-2 text-xs uppercase tracking-wide text-amber-300">
                Still to read ({notYet.length})
              </div>
              <div className="mb-5 space-y-1">
                {notYet.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm"
                  >
                    <span className="text-gray-200">{r.full_name}</span>
                    <span className="text-[11px] text-gray-600">
                      {r.branch ?? ''} {r.emp_code ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {done.length > 0 && (
            <>
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                Done ({done.length})
              </div>
              <div className="space-y-1">
                {done.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 text-gray-400">
                      <Check size={14} className="text-green-400" />
                      {r.full_name}
                    </span>
                    <span className="text-[11px] text-gray-600">
                      {r.read_at ? day(r.read_at) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}