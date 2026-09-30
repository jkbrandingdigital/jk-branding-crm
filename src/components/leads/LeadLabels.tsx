import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, RefreshCw, AlertCircle, CheckCircle2, Users, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { LABEL_CLS, type Label } from './labels'

type Rule = {
  id: string
  label_id: string
  field: string
  operator: 'contains' | 'equals' | 'starts_with'
  value: string
  priority: number
  is_active: boolean
}

type Person = { id: string; full_name: string; role: string; branch: string | null }

const COLORS = ['orange', 'blue', 'green', 'purple', 'pink', 'yellow', 'gray']
const FIELDS = [
  { key: 'form_name', label: 'Facebook form name' },
  { key: 'page_name', label: 'Facebook page name' },
  { key: 'source', label: 'Source' },
  { key: 'custom', label: 'Tracking parameter / form field…' },
]
const OPERATORS: Rule['operator'][] = ['contains', 'equals', 'starts_with']

export default function LeadLabels() {
  const { can, ready } = usePermissions()
  const allowed = ready && can('lead_settings')

  const [labels, setLabels] = useState<Label[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [people, setPeople] = useState<Person[]>([])
  const [memberOf, setMemberOf] = useState<Record<string, string[]>>({})
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState({ name: '', color: 'orange' })
  const [newRule, setNewRule] = useState({ label_id: '', field: 'form_name', custom: '', operator: 'contains' as Rule['operator'], value: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const [l, r, m, pr, ur, br] = await Promise.all([
      supabase.from('lead_labels').select('*').order('sort_order'),
      supabase.from('lead_label_rules').select('*').order('priority'),
      supabase.from('lead_label_members').select('label_id, user_id'),
      supabase.from('profiles').select('id, full_name, branch_id, is_active'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('branches').select('id, name'),
    ])
    if (l.error) setMsg({ type: 'err', text: l.error.message })
    setLabels((l.data ?? []) as Label[])
    setRules((r.data ?? []) as Rule[])

    const byLabel: Record<string, string[]> = {}
    for (const row of (m.data ?? []) as { label_id: string; user_id: string }[]) {
      ;(byLabel[row.label_id] ||= []).push(row.user_id)
    }
    setMemberOf(byLabel)

    const roleOf = new Map((ur.data ?? []).map((x: any) => [x.user_id, x.role as string]))
    const branchOf = new Map((br.data ?? []).map((x: any) => [x.id, x.name as string]))
    setPeople(
      ((pr.data ?? []) as any[])
        .filter((x) => x.is_active !== false)
        .map((x) => ({ id: x.id, full_name: x.full_name || 'Unnamed', role: roleOf.get(x.id) ?? '', branch: branchOf.get(x.branch_id) ?? null }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    )
    setLoading(false)
  }, [])

  useEffect(() => { if (allowed) load(); else if (ready) setLoading(false) }, [allowed, ready, load])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  async function addLabel() {
    const name = newLabel.name.trim()
    if (!name) return
    setBusy('label')
    const max = labels.reduce((m, l) => Math.max(m, l.sort_order), 0)
    const { error } = await supabase.from('lead_labels').insert({ name, color: newLabel.color, sort_order: max + 10 })
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    setNewLabel({ name: '', color: 'orange' })
    setMsg({ type: 'ok', text: 'Label added.' })
    load()
  }

  async function patchLabel(id: string, patch: Partial<Label>) {
    setLabels((all) => all.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    const { error } = await supabase.from('lead_labels').update(patch).eq('id', id)
    if (error) { setMsg({ type: 'err', text: error.message }); load() }
  }

  async function deleteLabel(l: Label) {
    if (!confirm(`Delete "${l.name}"? Leads keep their data but lose this label.`)) return
    setBusy(l.id)
    const { error } = await supabase.from('lead_labels').delete().eq('id', l.id)
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    load()
  }

  async function toggleMember(labelId: string, userId: string) {
    const current = memberOf[labelId] ?? []
    const on = current.includes(userId)
    setMemberOf((all) => ({ ...all, [labelId]: on ? current.filter((x) => x !== userId) : [...current, userId] }))
    const { error } = on
      ? await supabase.from('lead_label_members').delete().eq('label_id', labelId).eq('user_id', userId)
      : await supabase.from('lead_label_members').insert({ label_id: labelId, user_id: userId })
    if (error) { setMsg({ type: 'err', text: error.message }); load() }
  }

  async function addRule() {
    const field = newRule.field === 'custom' ? newRule.custom.trim() : newRule.field
    if (!newRule.label_id || !field || !newRule.value.trim()) {
      return setMsg({ type: 'err', text: 'Pick a label, a field and a value.' })
    }
    setBusy('rule')
    const max = rules.reduce((m, r) => Math.max(m, r.priority), 0)
    const { error } = await supabase.from('lead_label_rules').insert({
      label_id: newRule.label_id, field, operator: newRule.operator, value: newRule.value.trim(), priority: max + 10,
    })
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    setNewRule({ label_id: '', field: 'form_name', custom: '', operator: 'contains', value: '' })
    setMsg({ type: 'ok', text: 'Rule added.' })
    load()
  }

  async function deleteRule(id: string) {
    setBusy(id)
    const { error } = await supabase.from('lead_label_rules').delete().eq('id', id)
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    load()
  }

  const labelName = (id: string) => labels.find((l) => l.id === id)?.name ?? '—'
  const fieldLabel = (f: string) => FIELDS.find((x) => x.key === f)?.label ?? f

  if (ready && !allowed) {
    return (
      <div className="p-6 text-gray-400">
        You need the <span className="text-white">Lead settings</span> permission to open this page.
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lead Labels</h1>
          <p className="mt-1 text-sm text-gray-400">
            Labels group leads by product or campaign. Rules put the right label on Facebook leads automatically.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Labels */}
      <section className="rounded-lg border border-[#242424] bg-[#151515]">
        <div className="border-b border-[#242424] px-5 py-4">
          <h2 className="font-medium text-white">Labels</h2>
        </div>

        <div className="divide-y divide-[#242424]">
          {loading ? (
            <div className="py-8 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : labels.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No labels yet. Add one below.</p>
          ) : (
            labels.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className={`rounded-full border px-2.5 py-1 text-xs ${LABEL_CLS[l.color] ?? LABEL_CLS.gray}`}>{l.name}</span>
                <input
                  value={l.name}
                  onChange={(e) => setLabels((all) => all.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => patchLabel(l.id, { name: e.target.value.trim() })}
                  className={`${input} max-w-xs flex-1`}
                />
                <select value={l.color} onChange={(e) => patchLabel(l.id, { color: e.target.value })} className={`${input} w-32`}>
                  {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" checked={l.is_active} onChange={(e) => patchLabel(l.id, { is_active: e.target.checked })} className="h-4 w-4 accent-orange-500" />
                  Active
                </label>
                <select
                  value={(l as any).route_mode ?? 'pool'}
                  onChange={(e) => patchLabel(l.id, { route_mode: e.target.value } as any)}
                  className={`${input} w-52`}
                  title="Who gets these leads"
                >
                  <option value="pool">Normal sales round robin</option>
                  <option value="members">Only the people below</option>
                </select>
                <button
                  onClick={() => setOpenTeam(openTeam === l.id ? null : l.id)}
                  className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:text-white"
                >
                  <Users className="h-4 w-4" />
                  {(memberOf[l.id] ?? []).length} people
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openTeam === l.id ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={() => deleteLabel(l)}
                  disabled={busy === l.id}
                  className="ml-auto rounded-md border border-[#2a2a2a] p-2 text-gray-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                  title="Delete label"
                >
                  {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>

                {openTeam === l.id && (
                  <div className="w-full rounded-lg border border-[#2a2a2a] bg-[#121212] p-3">
                    <p className="mb-2 text-xs text-gray-400">
                      Leads with this label go to these people in turn. Leave it empty to use the normal sales round robin.
                    </p>
                    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {people.map((pp) => (
                        <li key={pp.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#1a1a1a]">
                            <input
                              type="checkbox"
                              checked={(memberOf[l.id] ?? []).includes(pp.id)}
                              onChange={() => toggleMember(l.id, pp.id)}
                              className="h-4 w-4 accent-orange-500"
                            />
                            <span className="text-white">{pp.full_name}</span>
                            <span className="text-gray-500">{[pp.role.replace('_', ' '), pp.branch].filter(Boolean).join(' · ')}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#242424] px-5 py-4">
          <input
            value={newLabel.name}
            onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            placeholder="New label name"
            className={`${input} max-w-xs flex-1`}
          />
          <select value={newLabel.color} onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })} className={`${input} w-32`}>
            {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={addLabel}
            disabled={!newLabel.name.trim() || busy === 'label'}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add label
          </button>
        </div>
      </section>

      {/* Rules */}
      <section className="rounded-lg border border-[#242424] bg-[#151515]">
        <div className="border-b border-[#242424] px-5 py-4">
          <h2 className="font-medium text-white">Automatic rules</h2>
          <p className="mt-1 text-sm text-gray-400">
            Checked from top to bottom when a Facebook lead arrives; the first match wins.
          </p>
        </div>

        <div className="divide-y divide-[#242424]">
          {rules.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No rules yet.</p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <span className="text-gray-400">If</span>
                <span className="text-white">{fieldLabel(r.field)}</span>
                <span className="text-gray-400">{r.operator.replace('_', ' ')}</span>
                <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-white">{r.value}</span>
                <span className="text-gray-400">→</span>
                <span className="text-orange-400">{labelName(r.label_id)}</span>
                <button
                  onClick={() => deleteRule(r.id)}
                  disabled={busy === r.id}
                  className="ml-auto rounded-md border border-[#2a2a2a] p-2 text-gray-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                  title="Delete rule"
                >
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t border-[#242424] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <select value={newRule.field} onChange={(e) => setNewRule({ ...newRule, field: e.target.value })} className={`${input} w-60`}>
              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            {newRule.field === 'custom' && (
              <input
                value={newRule.custom}
                onChange={(e) => setNewRule({ ...newRule, custom: e.target.value })}
                placeholder="parameter name, e.g. label"
                className={`${input} w-52`}
              />
            )}
            <select value={newRule.operator} onChange={(e) => setNewRule({ ...newRule, operator: e.target.value as Rule['operator'] })} className={`${input} w-40`}>
              {OPERATORS.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
            </select>
            <input
              value={newRule.value}
              onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
              placeholder="value, e.g. banner"
              className={`${input} max-w-xs flex-1`}
            />
            <select value={newRule.label_id} onChange={(e) => setNewRule({ ...newRule, label_id: e.target.value })} className={`${input} w-48`}>
              <option value="">Use label…</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              onClick={addRule}
              disabled={busy === 'rule'}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add rule
            </button>
          </div>

          <p className="text-xs text-gray-500">
            In Meta, open the lead form → Settings → Tracking parameters and add a parameter such as
            <span className="text-gray-300"> label = Banner Printing</span>. Then make a rule here:
            <span className="text-gray-300"> parameter "label" equals "Banner Printing" → Banner Printing</span>.
            Rules also work on the form name, so a form called "Banner Printing Rajkot" is caught by
            <span className="text-gray-300"> form name contains "banner"</span>.
          </p>
        </div>
      </section>
    </div>
  )
}