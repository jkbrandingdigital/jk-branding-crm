import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { loadWorkTypes, mins, type WorkType } from './taskUtils'

/*
  The kinds of design work and the time each is meant to take.

  The time here is for ONE piece, ONE option. The task multiplies it:

      allowed  =  this time  ×  how many pieces  ×  how many options

  So a banner at 1 hour, five of them, one option, is five hours; a logo
  at 3 hours with two options is six. Nothing here needs to know which
  job will be five of something.

  Changing a time here changes what new work is measured against. Jobs
  already finished keep the time they were given.
*/

export default function WorkTypesTab() {
  const { isSuper, ready } = usePermissions()
  const [rows, setRows] = useState<WorkType[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [name, setName] = useState('')
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)
  // What one of them is called — banner, page, panel. NOT "option":
  // options are counted inside each piece, and a unit called "option"
  // made the task screen read "Option 1 · Option 1".
  const [unit, setUnit] = useState('piece')

  const load = useCallback(async () => {
    setRows(await loadWorkTypes())
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  async function add() {
    const total = hours * 60 + minutes
    if (!name.trim()) return setMsg({ type: 'err', text: 'Give the work a name.' })
    if (total <= 0) return setMsg({ type: 'err', text: 'Set how long it should take.' })

    setBusy('add')
    const { error } = await supabase.from('work_types').insert({
      name: name.trim(),
      minutes: total,
      per_unit: true,                       // kept for older screens; decides nothing
      unit: unit.trim() || 'piece',
      sort_order: (rows[rows.length - 1]?.sort_order ?? 0) + 10,
    })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setName('')
    setHours(0)
    setMinutes(30)
    setMsg({ type: 'ok', text: 'Added.' })
    void load()
  }

  async function setField(r: WorkType, patch: Partial<WorkType>) {
    setBusy(r.id)
    const { error } = await supabase.from('work_types').update(patch).eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  async function remove(r: WorkType) {
    setBusy(r.id)
    // Kept, not deleted: tasks already measured against it must keep their name
    const { error } = await supabase.from('work_types').update({ is_active: false }).eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: `${r.name} is off the list. Tasks that used it keep it.` })
    void load()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  if (ready && !isSuper) {
    return (
      <div className="p-6 text-gray-400">
        Only a <span className="text-white">Super Admin</span> can change the work times.
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Design work types</h1>
        <p className="mt-1 text-sm text-gray-400">
          What one of these should take — one piece, one option. A task of five with two options
          gets ten times this. A task is green while it is inside its allowed time and red once it
          goes past. Time spent on a client's changes is measured by the clock and kept out of
          this — there is nothing to set for it.
        </p>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Work</th>
                <th className="px-4 py-2.5 font-medium">Time for one</th>
                <th className="px-4 py-2.5 font-medium">Call each one a</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f1f]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#1a1a1a]">
                  <td className="px-4 py-2.5">
                    <span className="block text-gray-200">{r.name}</span>
                    {r.note && <span className="text-xs text-gray-600">{r.note}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={2400}
                        defaultValue={r.minutes}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0
                          if (v > 0 && v !== r.minutes) void setField(r, { minutes: v })
                        }}
                        className="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none"
                      />
                      <span className="text-xs text-gray-500">mins · {mins(r.minutes)}</span>
                      {busy === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={r.unit ?? 'piece'}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== r.unit) void setField(r, { unit: v })
                      }}
                      aria-label={`What one ${r.name} is called`}
                      className="w-28 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => remove(r)}
                      aria-label={`Remove ${r.name}`}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-[#222] hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">Nothing here yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-[#242424] bg-[#151515]">
        <div className="border-b border-[#242424] px-5 py-4">
          <h2 className="font-medium text-white">Add another kind of work</h2>
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-xs text-gray-400">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Catalogue cover" className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Hours</span>
            <input type="number" min={0} max={40} value={hours} onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Minutes</span>
            <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} className={input} />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs text-gray-400">Call each one a</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="banner, page, panel" className={input} />
          </label>

        </div>
        <div className="border-t border-[#242424] px-5 py-4">
          <button
            onClick={add}
            disabled={busy === 'add'}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add · {mins(hours * 60 + minutes)} per {unit || 'piece'}
          </button>
        </div>
      </section>
    </div>
  )
}