import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Link2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { inr } from '../../lib/format'
import { useChartTheme } from '../../lib/chartTheme'
import ConvertLead from '../customers/ConvertLead'

/*
  Confirmed leads that never became clients.

  A lead marked Confirm is a sale. If nobody turns it into a customer,
  no project is created, and the money is never counted anywhere — not
  in the client's revenue, not in anyone's target. It does not go
  missing; it never arrives.

  This happened thirteen times to one branch manager, and one of those
  was ₹2,08,600 booked this month. Nobody noticed, because there was
  nowhere that noticing could happen: the prompt only appears when a
  card is dragged across the board, so a stage changed from the drawer,
  or set by an import, or set by someone without the customers right,
  passes in silence.

  So the prompt is not the fix. A list is. Whatever route a lead took
  into Confirm, it shows up here until somebody deals with it.

  Two ways to deal with it, because there are two real situations:

    The client does not exist yet          -> Convert
    The client was already added by hand   -> Link

  The second one matters more than it looks. People often skip the lead
  and add the project straight onto the client, which counts the money
  correctly but leaves the lead hanging. Without Link, this list would
  keep shouting about work that is already done, and a list that cries
  wolf is ignored within a fortnight.
*/

type Pending = {
  lead_id: string
  lead_name: string
  company: string | null
  phone: string | null
  requirement: string | null
  estimated: number | null
  stage_name: string
  assigned_to: string | null
  assigned_name: string | null
  branch_name: string | null
  created_at: string
  juni_ketla_din: number
  match_id: string | null
  match_code: string | null
  match_name: string | null
  match_by: string | null
}

const titleOf = (p: Pending) => (p.company?.trim() ? p.company : p.lead_name)

export default function PendingConvert({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Pending[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [convert, setConvert] = useState<Pending | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('leads_pending_convert')
    if (error) return setErr(error.message)
    setRows((data ?? []) as Pending[])
  }, [])

  useEffect(() => { void load() }, [load])

  /*
    This strip is always on the Leads page, so its colours cannot be
    dark-only — on the cream theme the pale amber text washed out to
    nothing. The tones are written for both, the same way the task
    cards and the timer are.
  */
  const { dark } = useChartTheme()
  const cls = {
    box:   dark ? { background: 'rgba(120,53,15,0.12)', borderColor: 'rgba(180,83,9,0.40)' } : { background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(180,83,9,0.35)' },
    head:  dark ? '#fcd34d' : '#92400e',
    dim:   dark ? 'rgba(252,211,77,0.65)' : 'rgba(146,64,14,0.75)',
    line:  dark ? 'rgba(180,83,9,0.25)' : 'rgba(180,83,9,0.22)',
    name:  dark ? '#f3f4f6' : '#2b2722',
    muted: dark ? '#9ca3af' : '#6b6356',
    btn:   dark ? { borderColor: '#2a2a2a', background: '#1a1a1a', color: '#e5e7eb' } : { borderColor: '#ddd6cb', background: '#fbf9f5', color: '#2b2722' },
  }

  const total = useMemo(
    () => rows.reduce((n, r) => n + Number(r.estimated ?? 0), 0),
    [rows],
  )

  // Nothing pending is the normal state, and it should look like
  // nothing at all. A green "all clear" banner sitting on the screen
  // every day is the fastest way to teach people to stop reading
  // banners.
  if (rows.length === 0) return null

  async function link(p: Pending) {
    if (!p.match_id) return
    setBusyId(p.lead_id)
    setErr('')
    const { error } = await supabase.rpc('lead_link_customer', {
      p_lead: p.lead_id,
      p_customer: p.match_id,
    })
    setBusyId(null)
    if (error) return setErr(error.message)
    setRows((cur) => cur.filter((x) => x.lead_id !== p.lead_id))
    onChanged?.()
  }

  return (
    <>
      {/* Spacing lives here, not on a wrapper in the caller: an empty
          wrapper left behind when this draws nothing is a gap nobody
          can explain six months later. */}
      <div className="mt-5 rounded-xl border" style={cls.box}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <AlertTriangle size={17} className="shrink-0" style={{ color: cls.head }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" style={{ color: cls.head }}>
              {rows.length} confirmed {rows.length === 1 ? 'lead has' : 'leads have'} not become a client yet
            </p>
            <p className="mt-0.5 text-xs" style={{ color: cls.dim }}>
              {total > 0 ? `About ${inr(total)} is not counted anywhere.` : 'Until they do, none of this work is counted anywhere.'}
            </p>
          </div>
          <span className="shrink-0 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: cls.box.borderColor, color: cls.head }}>
            {open ? 'Hide' : 'Show'}
          </span>
        </button>

        {open && (
          <div className="border-t px-2 pb-2" style={{ borderColor: cls.line }}>
            {err && (
              <p className="mx-2 mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{err}</p>
            )}

            <div className="max-h-[22rem] overflow-y-auto">
              {rows.map((p) => (
                <div
                  key={p.lead_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-2 py-2.5 last:border-0"
                  style={{ borderColor: cls.line }}
                >
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate text-sm" style={{ color: cls.name }}>{titleOf(p)}</p>
                    <p className="mt-0.5 truncate text-xs" style={{ color: cls.muted }}>
                      {p.assigned_name ?? 'Nobody'}
                      {p.branch_name ? ` · ${p.branch_name}` : ''}
                      {' · '}
                      {/* Age, not a date. "97 days" lands; "23 Jul" has to
                          be worked out before it means anything. */}
                      {p.juni_ketla_din === 0 ? 'today' : `${p.juni_ketla_din} days old`}
                    </p>
                  </div>

                  <span className="w-24 shrink-0 text-right text-sm" style={{ color: cls.name }}>
                    {Number(p.estimated ?? 0) > 0 ? inr(Number(p.estimated)) : '—'}
                  </span>

                  {/* A client with the same phone or name is already on
                      file, so offer the join first. Making a second one
                      splits the client's history in two, and a client
                      wrongly merged cannot be pulled apart again — but a
                      missed join can always be made later. */}
                  {p.match_id ? (
                    <button
                      onClick={() => void link(p)}
                      disabled={busyId === p.lead_id}
                      title={`Already on file as ${p.match_code} — matched by ${p.match_by === 'fone' ? 'phone' : 'name'}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:border-orange-500/50 disabled:opacity-50"
                      style={cls.btn}
                    >
                      {busyId === p.lead_id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      Link to {p.match_code}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConvert(p)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                    >
                      Convert
                      <ArrowRight size={13} />
                    </button>
                  )}

                  {/* The join is a guess, so there is always a way past
                      it. Two brothers' firms share one phone often
                      enough that forcing the join would be its own kind
                      of wrong. */}
                  {p.match_id && (
                    <button
                      onClick={() => setConvert(p)}
                      className="shrink-0 rounded-lg px-2 py-1.5 text-xs hover:underline"
                      style={{ color: cls.muted }}
                    >
                      Different firm
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {convert && (
        <ConvertLead
          leadId={convert.lead_id}
          leadName={titleOf(convert)}
          requirement={convert.requirement}
          estimated={convert.estimated}
          onClose={() => setConvert(null)}
          onDone={() => {
            setRows((cur) => cur.filter((x) => x.lead_id !== convert.lead_id))
            setConvert(null)
            onChanged?.()
          }}
        />
      )}
    </>
  )
}

/*
  A small button that shows the same count, for screens that have no
  room for the strip. Nothing uses it yet; it is here so the next screen
  that needs it does not grow a second copy of the query.
*/
export function usePendingConvertCount() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    void supabase.rpc('leads_pending_convert').then(({ data }) => {
      if (alive) setN((data ?? []).length)
    })
    return () => { alive = false }
  }, [])
  return n
}