import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Database, Download, Loader2, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/* ──────────────────────────────────────────────────────────────
   Everything in the CRM, pulled into one zip the admin can keep.
   Nothing is changed — this only reads.
   ────────────────────────────────────────────────────────────── */

type Group = { title: string; note: string; tables: string[] }

const GROUPS: Group[] = [
  {
    title: 'Leads',
    note: 'Every lead with its stage, who it sits with, and the whole follow-up history',
    tables: ['leads', 'lead_activities', 'lead_stages', 'lead_labels', 'lead_cancel_reasons', 'lead_followup_messages'],
  },
  {
    title: 'Tasks',
    note: 'Tasks, who they were handed to, comments, files and every move between stages',
    tables: ['tasks', 'task_assignees', 'task_comments', 'task_attachments', 'task_activities', 'task_stages', 'task_labels'],
  },
  {
    title: 'Quotations',
    note: 'Quotations with their items, the product list and the company details that print on them',
    tables: ['quotations', 'quotation_items', 'quotation_brochures', 'products', 'company_profile'],
  },
  {
    title: 'Reports and targets',
    note: 'Daily reports, evolution forms, deals and the targets they were measured against',
    tables: [
      'daily_reports', 'daily_evolution', 'deal_details', 'evolution_questions', 'work_norms',
      'employee_targets', 'branch_targets', 'sales_targets',
    ],
  },
  {
    title: 'People',
    note: 'Staff, roles, branches, attendance, leave and what each person is allowed to open',
    tables: [
      'profiles', 'user_roles', 'branches', 'attendance', 'leave_applications', 'employee_documents',
      'app_modules', 'role_permission_defaults', 'staff_permissions',
    ],
  },
  {
    title: 'Reminders and notes',
    note: 'Reminders with who they go to, and everyone’s notes',
    tables: ['reminders', 'reminder_recipients', 'notes'],
  },
]

// ---------- small helpers ----------
const cell = (v: unknown) => {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const head = cols.map(cell).join(',')
  const body = rows.map((r) => cols.map((c) => cell(r[c])).join(','))
  // The BOM makes Excel read Gujarati and ₹ properly
  return '﻿' + [head, ...body].join('\r\n')
}

// Supabase hands over 1000 rows at a time
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const stamp = () =>
  new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
    .replace(/[: ]/g, '-')
    .slice(0, 16)

export default function BackupCenter() {
  const { role } = useAuth()
  const isAdmin = role === 'super_admin'

  const [picked, setPicked] = useState<string[]>(GROUPS.map((g) => g.title))
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})

  // A quick count, so the admin sees how much is in there before downloading
  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      const want = ['leads', 'tasks', 'quotations', 'daily_reports', 'notes', 'reminders']
      const got: Record<string, number> = {}
      for (const t of want) {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
        if (count !== null && count !== undefined) got[t] = count
      }
      setCounts(got)
    })()
  }, [isAdmin])

  const toggle = (title: string) =>
    setPicked((list) => (list.includes(title) ? list.filter((t) => t !== title) : [...list, title]))

  async function download() {
    setError('')
    setDone(null)
    const tables = GROUPS.filter((g) => picked.includes(g.title)).flatMap((g) => g.tables)
    if (tables.length === 0) return setError('Pick at least one set.')

    setBusy(true)
    try {
      setStep('Getting the zip ready…')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const raw = zip.folder('tables')!

      const all: Record<string, Record<string, unknown>[]> = {}
      const skipped: string[] = []
      const summary: string[] = []

      for (const t of tables) {
        setStep(`Reading ${t.replace(/_/g, ' ')}…`)
        try {
          const rows = await fetchAll(t)
          all[t] = rows
          summary.push(`${t.padEnd(28)} ${String(rows.length).padStart(7)} rows`)
          if (rows.length > 0) raw.file(`${t}.csv`, toCsv(rows))
        } catch (e) {
          // One table missing should not cost the whole backup
          skipped.push(`${t} — ${(e as Error).message}`)
        }
      }

      // The readable sheets: names instead of ids
      setStep('Writing the readable sheets…')
      const nameOf = new Map(
        (all.profiles ?? []).map((p) => [String(p.id), String(p.full_name ?? '')]),
      )
      const stageOf = new Map((all.lead_stages ?? []).map((s) => [String(s.id), String(s.name)]))
      const labelOf = new Map((all.lead_labels ?? []).map((l) => [String(l.id), String(l.name)]))
      const tStageOf = new Map((all.task_stages ?? []).map((s) => [String(s.id), String(s.name)]))
      const tLabelOf = new Map((all.task_labels ?? []).map((l) => [String(l.id), String(l.name)]))

      if (all.leads) {
        zip.file(
          'Leads.csv',
          toCsv(
            all.leads.map((l) => ({
              'Lead no': l.lead_no,
              Name: l.name,
              Phone: l.phone,
              'Alternate phone': l.alt_phone,
              Email: l.email,
              Company: l.company,
              City: l.city,
              Requirement: l.requirement,
              Source: l.source,
              Stage: stageOf.get(String(l.stage_id)) ?? '',
              Label: labelOf.get(String(l.label_id)) ?? '',
              'Assigned to': nameOf.get(String(l.assigned_to)) ?? '',
              'Created by': nameOf.get(String(l.created_by)) ?? '',
              Rating: l.rating,
              'Estimated amount': l.estimated_amount,
              'Next follow-up': l.next_follow_up,
              'Cancel reason': l.cancel_reason,
              'Cancel note': l.cancel_note,
              Created: l.created_at,
              Deleted: l.deleted_at,
            })),
          ),
        )
      }

      if (all.tasks) {
        const onTask = new Map<string, string[]>()
        for (const a of all.task_assignees ?? []) {
          if (!a.is_current) continue
          const k = String(a.task_id)
          onTask.set(k, [...(onTask.get(k) ?? []), nameOf.get(String(a.user_id)) ?? ''])
        }
        zip.file(
          'Tasks.csv',
          toCsv(
            all.tasks.map((t) => ({
              'Task no': t.task_no,
              Subject: t.subject,
              Status: tStageOf.get(String(t.stage_id)) ?? '',
              Label: tLabelOf.get(String(t.label_id)) ?? '',
              Priority: t.priority,
              'Assigned to': (onTask.get(String(t.id)) ?? []).join(' | '),
              'Created by': nameOf.get(String(t.created_by)) ?? '',
              Customer: t.customer_name,
              'Customer mobile': t.customer_phone,
              Start: t.start_at,
              Due: t.due_at,
              Finished: t.completed_at,
              Repeat: t.repeat_every,
              Created: t.created_at,
              Deleted: t.deleted_at,
            })),
          ),
        )
      }

      if (all.quotations) {
        const itemsOf = new Map<string, Record<string, unknown>[]>()
        for (const it of all.quotation_items ?? []) {
          const k = String(it.quotation_id)
          itemsOf.set(k, [...(itemsOf.get(k) ?? []), it])
        }
        zip.file(
          'Quotations.csv',
          toCsv(
            all.quotations.map((q) => ({
              'Quote no': q.quote_no,
              Customer: q.customer_name,
              Company: q.company_name,
              Mobile: q.mobile,
              Email: q.email,
              Date: q.quote_date,
              'Valid until': q.valid_until,
              'GST type': q.gst_type,
              'GST %': q.gst_percent,
              Subtotal: q.subtotal,
              Discount: q.discount_total,
              Tax: q.tax_total,
              Total: q.total,
              Status: q.status,
              'Made by': nameOf.get(String(q.created_by)) ?? '',
              Items: (itemsOf.get(String(q.id)) ?? [])
                .map((it) => `${it.name} x${it.qty} = ${it.sub_total}`)
                .join(' | '),
              Created: q.created_at,
            })),
          ),
        )
      }

      if (all.daily_reports) {
        zip.file(
          'Daily reports.csv',
          toCsv(
            all.daily_reports.map((r) => ({
              Date: r.work_date,
              Person: nameOf.get(String(r.user_id)) ?? '',
              Calls: r.calls,
              'Quality leads': r.quality_leads,
              Positive: r.positive_leads,
              Hot: r.hot_leads,
              Fail: r.fail_leads,
              'Deals closed': r.deals_closed,
              Revenue: r.revenue,
              'Other activity': r.other_activity,
              'Admin note': r.admin_note,
            })),
          ),
        )
      }

      // The whole thing, exactly as it sits in the database
      setStep('Packing…')
      zip.file('backup.json', JSON.stringify(all, null, 2))
      zip.file(
        'README.txt',
        [
          'JK Branding CRM — backup',
          `Taken: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
          '',
          'Leads.csv, Tasks.csv, Quotations.csv, Daily reports.csv',
          '    Open these in Excel. Names instead of ids, ready to read.',
          '',
          'tables/',
          '    One CSV per database table, exactly as stored.',
          '',
          'backup.json',
          '    Everything in one file. This is the one to use if the data ever',
          '    has to be put back into the database.',
          '',
          'What came out:',
          ...summary,
          ...(skipped.length ? ['', 'Not included:', ...skipped] : []),
          '',
          'Keep this file somewhere safe. It holds customer phone numbers',
          'and prices, so it is not for sharing.',
        ].join('\n'),
      )

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jk-crm-backup-${stamp()}.zip`
      a.click()
      URL.revokeObjectURL(url)

      const rows = Object.values(all).reduce((s, r) => s + r.length, 0)
      setDone(`${rows.toLocaleString('en-IN')} rows across ${Object.keys(all).length} tables.`)
    } catch (e) {
      setError((e as Error).message || 'Could not build the backup.')
    }
    setBusy(false)
    setStep('')
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[#242424] bg-[#151515] p-6">
        <p className="flex items-center gap-2 text-gray-300">
          <ShieldAlert size={18} className="text-orange-400" />
          Only a super admin can take a backup of the whole CRM.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Backup</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          One zip with everything in the CRM — leads, tasks, quotations, reports. Nothing is changed or removed.
        </p>
      </div>

      {Object.keys(counts).length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#242424] bg-[#242424] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['leads', 'Leads'],
            ['tasks', 'Tasks'],
            ['quotations', 'Quotations'],
            ['daily_reports', 'Reports'],
            ['notes', 'Notes'],
            ['reminders', 'Reminders'],
          ].map(([k, l]) => (
            <div key={k} className="bg-[#151515] px-4 py-3">
              <p className="text-xs text-gray-500">{l}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {(counts[k] ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-300">
          <Database size={15} /> What goes in
        </h2>
        <ul className="space-y-2">
          {GROUPS.map((g) => {
            const on = picked.includes(g.title)
            return (
              <li key={g.title}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    on ? 'border-orange-500/50 bg-orange-500/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(g.title)}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white">{g.title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{g.note}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={download}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {busy ? 'Working…' : 'Download backup'}
          </button>
          {step && <span className="text-sm text-gray-400">{step}</span>}
        </div>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            <AlertCircle size={15} /> {error}
          </p>
        )}
        {done && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
            <CheckCircle2 size={15} /> Saved to your Downloads — {done}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5 text-sm text-gray-400">
        <h2 className="mb-2 text-sm font-medium text-gray-300">What is inside the zip</h2>
        <ul className="space-y-1.5 text-xs">
          <li><span className="text-gray-300">Leads.csv, Tasks.csv, Quotations.csv, Daily reports.csv</span> — open these in Excel, names instead of ids</li>
          <li><span className="text-gray-300">tables/</span> — every table as its own CSV, exactly as stored</li>
          <li><span className="text-gray-300">backup.json</span> — the whole thing in one file, for putting data back if it ever comes to that</li>
          <li><span className="text-gray-300">README.txt</span> — the date and how many rows came out</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          The file holds customer numbers and prices. Keep it on a drive only you open — not on a shared folder.
        </p>
      </section>
    </div>
  )
}