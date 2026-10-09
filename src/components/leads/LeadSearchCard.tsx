import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { inr } from '../../lib/format'
import { plainText } from '../RichText'
import { LABEL_CLS, type Label } from './labels'
import { fmtDT, sourceOf, type Lead, type Stage, type Staff } from './leadUtils'

type LeadL = Lead & { label_id?: string | null; label_ids?: string[] | null }

type TabKey = 'lead' | 'task' | 'reminder' | 'note' | 'quotation'
type Counts = Record<Exclude<TabKey, 'lead'>, number>

// Each tab reads one table, keyed on lead_id
const SOURCES_FOR: Record<Exclude<TabKey, 'lead'>, string> = {
  task: 'tasks',
  reminder: 'reminders',
  note: 'notes',
  quotation: 'quotations',
}

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

export default function LeadSearchCard({
  lead,
  stages,
  labels,
  staff,
  onOpen,
}: {
  lead: LeadL
  stages: Stage[]
  labels: Label[]
  staff: Staff[]
  onOpen: (id: string) => void
}) {
  // The board only carries what a card draws, so read the rest here —
  // it is three rows at most.
  const [full, setFull] = useState<LeadL>(lead)
  useEffect(() => {
    setFull(lead)
    let alive = true
    supabase
      .from('leads')
      .select('*')
      .eq('id', lead.id)
      .maybeSingle()
      .then(({ data }) => { if (alive && data) setFull({ ...lead, ...(data as LeadL) }) })
    return () => { alive = false }
  }, [lead])

  const [tab, setTab] = useState<TabKey>('lead')
  const [counts, setCounts] = useState<Counts>({ task: 0, reminder: 0, note: 0, quotation: 0 })
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? '—' : 'Unassigned')
  const stage = stages.find((s) => s.id === full.stage_id)
  const leadLabels = (full.label_ids ?? []).map((id) => labels.find((x) => x.id === id)).filter(Boolean) as Label[]

  // How much is attached to this lead
  useEffect(() => {
    let alive = true
    ;(async () => {
      const keys = Object.keys(SOURCES_FOR) as (keyof Counts)[]
      const res = await Promise.all(
        keys.map((k) =>
          supabase.from(SOURCES_FOR[k]).select('id', { count: 'exact', head: true }).eq('lead_id', lead.id),
        ),
      )
      if (!alive) return
      const next = { task: 0, reminder: 0, note: 0, quotation: 0 } as Counts
      keys.forEach((k, i) => { next[k] = res[i].count ?? 0 })
      setCounts(next)
    })()
    return () => { alive = false }
  }, [lead.id])

  // What is attached, once a tab is opened
  const openTab = useCallback(
    async (key: TabKey) => {
      setTab(key)
      if (key === 'lead') return setRows([])
      setBusy(true)
      const { data } = await supabase
        .from(SOURCES_FOR[key])
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setRows((data ?? []) as Row[])
      setBusy(false)
    },
    [lead.id],
  )

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'lead', label: 'Lead', count: 1 },
    { key: 'task', label: 'Task', count: counts.task },
    { key: 'reminder', label: 'Reminder', count: counts.reminder },
    { key: 'note', label: 'Note', count: counts.note },
    { key: 'quotation', label: 'Quotation', count: counts.quotation },
  ]

  const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-32 shrink-0 font-medium text-gray-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-gray-200">{children}</span>
    </div>
  )

  // One row of whatever table the open tab is showing
  const rowTitle = (r: Row) =>
    str(r.subject) || str(r.title) || (r.quote_no ? `Quotation ${str(r.quote_no)}` : '') || '—'
  const rowSide = (r: Row) => {
    if (r.total != null) return inr(Number(r.total) || 0)
    const when = str(r.due_date) || str(r.run_at) || str(r.created_at)
    return when ? fmtDT(when) : ''
  }
  const rowBody = (r: Row) => {
    const t = str(r.body) || str(r.message) || str(r.description)
    return t ? plainText(t).slice(0, 140) : ''
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[#242424] px-3">
        {TABS.map((t) => {
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => openTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                on ? 'border-orange-500 font-medium text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[11px] leading-5 ${
                  on ? 'bg-orange-500 text-white' : 'bg-[#1f1f1f] text-gray-400'
                }`}
              >
                {t.count ?? 0}
              </span>
            </button>
          )
        })}
        <button
          onClick={() => onOpen(lead.id)}
          className="ml-auto flex items-center gap-1.5 py-2.5 text-sm text-gray-400 hover:text-white"
        >
          Open lead <ExternalLink size={14} />
        </button>
      </div>

      <div className="px-5 py-4">
        {tab === 'lead' ? (
          <div className="divide-y divide-[#1c1c1c]">
            <Line label="Customer Name">{full.name}</Line>
            <Line label="Company Name">{full.company || '—'}</Line>
            <Line label="Mobile No">{full.phone || '—'}</Line>
            <Line label="Email">{full.email || '—'}</Line>
            <Line label="Source">
              <span className={`rounded-full px-2 py-0.5 text-xs ${sourceOf(full.source).cls}`}>
                {sourceOf(full.source).label}
              </span>
            </Line>
            <Line label="Status">
              {stage ? (
                <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: stage.color }}>
                  {stage.name}
                </span>
              ) : (
                '—'
              )}
            </Line>
            <Line label="Label">
              {leadLabels.length === 0 ? (
                '—'
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {leadLabels.map((lb) => (
                    <span
                      key={lb.id}
                      className={`rounded-full border px-2 py-0.5 text-xs ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`}
                    >
                      {lb.name}
                    </span>
                  ))}
                </span>
              )}
            </Line>
            <Line label="Date">{fmtDT(full.created_at)}</Line>
            <Line label="Next follow-up">{full.next_follow_up ? fmtDT(full.next_follow_up) : '—'}</Line>
            <Line label="Created By">{nameOf(full.created_by)}</Line>
            <Line label="Assign To">{nameOf(full.assigned_to)}</Line>
            <Line label="Address">{full.city || '—'}</Line>
            <Line label="Estimated">{inr(Number(full.estimated_amount) || 0)}</Line>
            <Line label="Comment">{full.requirement || '—'}</Line>
          </div>
        ) : busy ? (
          <p className="py-6 text-center text-sm text-gray-500">
            <Loader2 className="inline h-4 w-4 animate-spin" />
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Nothing on this lead yet.</p>
        ) : (
          <ul className="divide-y divide-[#1c1c1c]">
            {rows.map((r, i) => (
              <li key={str(r.id) || i} className="flex items-start gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-200">{rowTitle(r)}</span>
                  {rowBody(r) && <span className="mt-0.5 block truncate text-xs text-gray-500">{rowBody(r)}</span>}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{rowSide(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}