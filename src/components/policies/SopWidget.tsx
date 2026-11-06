// src/components/policies/SopWidget.tsx
//
// A dashboard card: the SOPs and policies this person still owes a read.
//
// It is the one place everyone passes every day — the dashboard — so it
// is where a must-read procedure belongs, not buried on a Policies page
// somebody opens once. It shows only what is UNREAD and must-read: a
// card that is usually empty is read; a card that always has something
// in it is wallpaper. When there is nothing to read, it shows a quiet
// "all caught up" line rather than vanishing, so the person knows the
// check happened.
//
// Reads come from my_policies, which already returns only what covers
// this person (their department, their role, or them by name). SOPs open
// their PDF through a signed URL; written policies link to the Policies
// page. Acknowledging is the same policy_mark_read() the Policies screen
// uses, so a read here shows on HR's register there.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, BookOpen, Check, Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Doc = {
  id: string
  title: string
  summary: string | null
  doc_type: 'policy' | 'sop'
  file_path: string | null
  file_name: string | null
  department: string | null
  must_read: boolean
  read_this_version: boolean
}

// Where the person's own Policies page lives, so an item can deep-link
// to the full list. Passed in because it differs per role.
export default function SopWidget({ policiesPath }: { policiesPath: string }) {
  const [rows, setRows] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('my_policies')
      .select('id, title, summary, doc_type, file_path, file_name, department, must_read, read_this_version')
    if (error) setErr(error.message)
    else {
      setErr(null)
      // Only what is owed: must-read and not yet acknowledged, SOPs first
      // because a procedure to follow is more pressing than a rule to note.
      setRows(
        ((data ?? []) as Doc[])
          .filter((d) => d.must_read && !d.read_this_version)
          .sort((a, b) => (a.doc_type === b.doc_type ? 0 : a.doc_type === 'sop' ? -1 : 1)),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function openPdf(d: Doc) {
    setErr(null)
    if (!d.file_path) { setErr('No file is attached.'); return }
    const { data, error } = await supabase.storage.from('sops').createSignedUrl(d.file_path, 600)
    if (error || !data?.signedUrl) { setErr(error?.message ?? 'Could not open the PDF.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function markRead(id: string) {
    setBusy(id)
    const { data, error } = await supabase.rpc('policy_mark_read', { p_policy: id })
    setBusy(null)
    if (error) { setErr(error.message); return }
    if (data && (data as { ok: boolean }).ok === false) {
      setErr((data as { reason?: string }).reason ?? 'That did not go through.')
      return
    }
    await load()
  }

  return (
    <section className="rounded-2xl border border-[#242424] bg-[#141414]">
      <div className="flex items-center gap-2 border-b border-[#242424] px-5 py-3.5">
        <FileText size={15} className="text-orange-400" />
        <h2 className="text-sm font-medium text-white">To read</h2>
        {rows.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
            {rows.length}
          </span>
        )}
        <Link
          to={policiesPath}
          className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-orange-400"
        >
          All <ChevronRight size={13} />
        </Link>
      </div>

      {err && <p className="border-b border-[#242424] px-5 py-2 text-xs text-red-300">{err}</p>}

      {loading ? (
        <p className="px-5 py-6 text-center text-sm text-gray-500">Looking…</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-5 py-6 text-center text-sm text-gray-500">
          <Check size={15} className="text-green-500" /> You are up to date
        </p>
      ) : (
        <ul className="divide-y divide-[#1f1f1f]">
          {rows.map((d) => (
            <li key={d.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400">
                  {d.doc_type === 'sop' ? <FileText size={15} /> : <BookOpen size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{d.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {d.doc_type === 'sop' ? 'SOP' : 'Policy'}
                    {d.department ? ` · ${d.department}` : ''}
                  </p>
                  {d.summary && <p className="mt-1 line-clamp-1 text-xs text-gray-400">{d.summary}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {d.doc_type === 'sop' ? (
                      <button
                        onClick={() => void openPdf(d)}
                        className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                      >
                        <FileText size={13} /> Open PDF
                      </button>
                    ) : (
                      <Link
                        to={policiesPath}
                        className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                      >
                        <BookOpen size={13} /> Read it
                      </Link>
                    )}
                    <button
                      onClick={() => void markRead(d.id)}
                      disabled={busy === d.id}
                      className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-orange-600 disabled:opacity-50"
                    >
                      {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      I have read it
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}