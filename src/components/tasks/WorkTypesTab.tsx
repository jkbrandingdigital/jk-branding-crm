import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, CornerDownRight, GripVertical, Layers, ListPlus, Loader2, Plus, RotateCcw,
  Search, Trash2, Undo2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { mins, type WorkType } from './taskUtils'

/*
  The kinds of design work and the time each is meant to take.

  The time here is for ONE piece, ONE option. The task multiplies it:

      allowed  =  this time  ×  how many pieces  ×  how many options

  So a banner at 1 hour, five of them, one option, is five hours; a logo
  at 3 hours with two options is six. Nothing here needs to know which
  job will be five of something.

  Changing a time here changes what new work is measured against. Jobs
  already finished keep the time they were given.

  GROUPS (Brochure, Menu Design) have no time of their own — the time
  comes from their parts, which are added on the task. So a group's row
  has no minutes box, and its parts are listed indented underneath it.
  Listed flat, a part looked like a duplicate of some other row and got
  removed — which quietly took it out of every new brochure.
*/

export default function WorkTypesTab() {
  const { isSuper, ready } = usePermissions()
  // Every row, active or not: removed ones are shown at the bottom so
  // they can be brought back from here, not only from SQL.
  const [all, setAll] = useState<WorkType[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)

  const [name, setName] = useState('')
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)
  // What one of them is called — banner, page, panel. NOT "option":
  // options are counted inside each piece, and a unit called "option"
  // made the task screen read "Option 1 · Option 1".
  const [unit, setUnit] = useState('piece')
  // Optional: make the new work a part of a group (e.g. a Menu part).
  const [partOf, setPartOf] = useState('')
  // Or make it a group itself (Brochure, Menu Design) — no time of its
  // own; its parts are added under it with "Part of a group".
  const [asGroup, setAsGroup] = useState(false)

  // Putting existing work into a group: drag a row onto the group, or
  // open "Add parts" on the group and tick several at once.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [pickFor, setPickFor] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickQ, setPickQ] = useState('')

  // "Make group": turn one kind of work into a group in one go, with its
  // parts filled in from an existing group (Brochure) so nothing has to be
  // typed twice.
  type Tpl = { name: string; minutes: number; per_page: boolean; mockup: boolean }
  const [makeFor, setMakeFor] = useState<string | null>(null)
  const [tpl, setTpl] = useState<Tpl[]>([])

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('work_types').select('*').order('sort_order')
    if (error) return setMsg({ type: 'err', text: error.message })
    setAll((data ?? []) as WorkType[])
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const active = useMemo(() => all.filter((w) => w.is_active), [all])
  const removed = useMemo(() => all.filter((w) => !w.is_active), [all])
  const groups = useMemo(() => active.filter((w) => w.is_group), [active])
  const nameOf = useMemo(() => new Map(all.map((w) => [w.id, w.name])), [all])

  // What can go into the group being filled: any active work that is not
  // a group and not already in this one. A part of another group shows
  // too, marked, so it can be moved across.
  const candidates = useMemo(
    () => active.filter((w) => !w.is_group && w.parent_id !== pickFor),
    [active, pickFor],
  )

  async function moveInto(groupId: string, ids: string[]) {
    const list = ids.filter((id) => id !== groupId)
    if (list.length === 0) return
    const g = all.find((w) => w.id === groupId)
    if (!g?.is_group) return
    setBusy(groupId)
    // Right after the group's last part, keeping the order they were in.
    const after = Math.max(g.sort_order ?? 0, ...all.filter((w) => w.parent_id === groupId).map((w) => w.sort_order ?? 0))
    const rows = all.filter((w) => list.includes(w.id)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    let err = ''
    for (let i = 0; i < rows.length; i++) {
      const { error } = await supabase
        .from('work_types')
        .update({ parent_id: groupId, sort_order: after + i + 1 })
        .eq('id', rows[i].id)
      if (error) { err = error.message; break }
    }
    setBusy('')
    if (err) return setMsg({ type: 'err', text: err })
    setPickFor(null)
    setPicked(new Set())
    setMsg({
      type: 'ok',
      text: `${rows.map((w) => w.name).join(', ')} ${rows.length === 1 ? 'is' : 'are'} now part of ${g.name}.`,
    })
    void load()
  }

  // The parts of a group, as a template: "Brochure · Inner Pages" → "Inner Pages".
  function partsOf(groupId: string): Tpl[] {
    const g = (all.find((w) => w.id === groupId)?.name ?? '').toLowerCase()
    // Drop the group's name from the front: "Brochure Inner Pages",
    // "Menu Design · Inner Pages" → "Inner Pages".
    const strip = (n: string) => {
      let s = n.trim()
      for (const pre of [g, g.split(' ')[0], 'brochure', 'menu']) {
        if (pre && s.toLowerCase().startsWith(pre + ' ')) s = s.slice(pre.length).trim()
        if (pre && s.toLowerCase().startsWith(pre + '·')) s = s.slice(pre.length).trim()
      }
      return s.replace(/^[·:\-\s]+/, '').trim()
    }
    return active
      .filter((w) => w.parent_id === groupId)
      .map((w) => ({
        name: strip(w.name) || w.name,
        minutes: w.minutes,
        per_page: !!w.per_unit && (w.unit ?? '').toLowerCase() === 'page',
        mockup: w.allows_mockup !== false,
      }))
  }

  function openMake(r: WorkType) {
    if (makeFor === r.id) return setMakeFor(null)
    setPickFor(null)
    const brochure = groups.find((g) => g.name.toLowerCase() === 'brochure') ?? groups[0]
    const from = brochure ? partsOf(brochure.id) : []
    setTpl(from.length > 0 ? from : [
      { name: 'Front-Back Concept', minutes: 120, per_page: false, mockup: true },
      { name: 'Inner Pages', minutes: 45, per_page: true, mockup: false },
    ])
    setMakeFor(r.id)
  }

  async function makeGroup(r: WorkType) {
    const parts = tpl.filter((p) => p.name.trim())
    if (parts.length === 0) return setMsg({ type: 'err', text: 'Give each part a name.' })
    setBusy(r.id)
    const { error } = await supabase.rpc('work_type_make_group', {
      p_type: r.id,
      p_parts: parts.map((p) => ({ ...p, name: p.name.trim(), minutes: Math.max(1, p.minutes || 1) })),
    })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMakeFor(null)
    setMsg({ type: 'ok', text: `${r.name} is now a group with ${parts.map((p) => p.name.trim()).join(' + ')}.` })
    void load()
  }

  async function takeOut(r: WorkType) {
    const group = r.parent_id ? nameOf.get(r.parent_id) : null
    if (!window.confirm(`Take "${r.name}" out of ${group ?? 'its group'}?\n\nIt becomes its own kind of work again and can be picked on its own when creating a task. New ${group ?? 'group'} tasks will not offer it as a part.`)) return
    setBusy(r.id)
    const { error } = await supabase.from('work_types').update({ parent_id: null }).eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: `${r.name} stands on its own again.` })
    void load()
  }

  // Top-level rows in their order, each group followed by its parts.
  // A part whose group is gone still shows, at the end, so it is never
  // silently lost.
  const ordered = useMemo(() => {
    const out: { w: WorkType; part: boolean }[] = []
    const placed = new Set<string>()
    for (const w of active) {
      if (w.parent_id) continue
      out.push({ w, part: false })
      placed.add(w.id)
      if (w.is_group) {
        for (const p of active.filter((x) => x.parent_id === w.id)) {
          out.push({ w: p, part: true })
          placed.add(p.id)
        }
      }
    }
    for (const w of active) if (!placed.has(w.id)) out.push({ w, part: true })
    return out
  }, [active])

  async function add() {
    const total = hours * 60 + minutes
    if (!name.trim()) return setMsg({ type: 'err', text: 'Give the work a name.' })

    // A group: name only. Its time comes from the parts added under it.
    if (asGroup) {
      setBusy('add')
      const { error } = await supabase.from('work_types').insert({
        name: name.trim(),
        minutes: 1,                 // not used — a group's time is its parts'
        per_unit: false,
        unit: null,
        is_group: true,
        note: 'Set the parts on the task',
        sort_order: Math.max(0, ...all.map((w) => w.sort_order ?? 0)) + 10,
      })
      setBusy('')
      if (error) return setMsg({ type: 'err', text: error.message })
      setName('')
      setAsGroup(false)
      setMsg({ type: 'ok', text: `${name.trim()} added as a group. Now add its parts below with "Part of a group".` })
      void load()
      return
    }

    if (total <= 0) return setMsg({ type: 'err', text: 'Set how long it should take.' })

    // A part sits right after its group's last part; anything else at the end.
    const siblings = partOf ? all.filter((w) => w.parent_id === partOf || w.id === partOf) : all
    const after = Math.max(0, ...siblings.map((w) => w.sort_order ?? 0))

    setBusy('add')
    const { error } = await supabase.from('work_types').insert({
      name: name.trim(),
      minutes: total,
      per_unit: true,                       // kept for older screens; decides nothing
      unit: unit.trim() || 'piece',
      parent_id: partOf || null,
      sort_order: after + (partOf ? 1 : 10),
    })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setName('')
    setHours(0)
    setMinutes(30)
    setPartOf('')
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
    // Say what removing actually does — for a part and a group it is more
    // than "off the list".
    const group = r.parent_id ? nameOf.get(r.parent_id) : null
    const warning = group
      ? `"${r.name}" is a part of ${group}.\n\nRemoving it takes it out of every NEW ${group} task. Tasks that already have it keep it.\n\nRemove it?`
      : r.is_group
        ? `"${r.name}" is a group.\n\nRemoving it means it can no longer be picked for a new task. Its parts stay but have nowhere to go.\n\nRemove it?`
        : `Remove "${r.name}"? Tasks that used it keep it.`
    if (!window.confirm(warning)) return

    setBusy(r.id)
    // Kept, not deleted: tasks already measured against it must keep their name
    const { error } = await supabase.from('work_types').update({ is_active: false }).eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: `${r.name} is off the list. It can be brought back from "Removed" below.` })
    void load()
  }

  async function restore(r: WorkType) {
    setBusy(r.id)
    const { error } = await supabase.from('work_types').update({ is_active: true }).eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: `${r.name} is back.` })
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
          goes past.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          <span className="text-gray-300">Mockup</span> is the time one mockup adds when the designer
          presses "+ mockup" on a task. <span className="text-gray-300">Changes</span> is the time one
          round of the client's changes adds. A task keeps the time it was given, so changing these
          only affects mockups and changes added from now on.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          <Layers className="mr-1 inline h-3.5 w-3.5 text-orange-400" />
          A <span className="text-gray-300">group</span> (like Brochure) has no time of its own. Its
          parts are listed under it, and the designer adds them on the task. To put existing work
          into a group, <span className="text-gray-300">drag its row onto the group</span>, or press
          <span className="text-gray-300"> Add parts</span> on the group and tick several at once.
        </p>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Work</th>
                <th className="px-4 py-2.5 font-medium">Time for one</th>
                <th className="px-4 py-2.5 font-medium">Mockup</th>
                <th className="px-4 py-2.5 font-medium">Changes</th>
                <th className="px-4 py-2.5 font-medium">Call each one a</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f1f]">
              {ordered.map(({ w: r, part }) => {
                // Which group a drop on this row goes into: the group row
                // itself, or any of its parts.
                const target = r.is_group ? r.id : part ? r.parent_id : null
                const lit = !!dragId && !!target && dropOn === target && dragId !== target
                return (
                <Fragment key={r.id}>
                <tr
                  // A standalone kind of work (or a part) can be dragged onto a group.
                  draggable={!r.is_group}
                  onDragStart={(e) => { setDragId(r.id); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragId(null); setDropOn(null) }}
                  onDragOver={(e) => {
                    if (!dragId || !target || dragId === target) return
                    e.preventDefault()
                    if (dropOn !== target) setDropOn(target)
                  }}
                  onDragLeave={() => { if (dropOn === target) setDropOn(null) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = dragId
                    setDragId(null); setDropOn(null)
                    if (id && target && id !== target) void moveInto(target, [id])
                  }}
                  className={`hover:bg-[#1a1a1a] ${r.is_group ? 'bg-[#171717]' : ''} ${
                    lit ? 'outline outline-2 -outline-offset-2 outline-orange-500' : ''
                  } ${dragId === r.id ? 'opacity-40' : ''}`}
                >
                  <td className={`py-2.5 pr-4 ${part ? 'pl-10' : 'pl-4'}`}>
                    <span className="flex items-center gap-1.5 text-gray-200">
                      {!r.is_group && (
                        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-600" aria-hidden />
                      )}
                      {part && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-gray-600" />}
                      {r.is_group && <Layers className="h-3.5 w-3.5 shrink-0 text-orange-400" />}
                      <span className={r.is_group ? 'font-medium' : ''}>{r.name}</span>
                      {r.is_group && (
                        <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-300">Group</span>
                      )}
                      {part && r.parent_id && !nameOf.has(r.parent_id) && (
                        <span className="text-[11px] text-amber-400">group missing</span>
                      )}
                    </span>
                    {r.note && <span className={`block text-xs text-gray-600 ${part ? 'pl-5' : ''}`}>{r.note}</span>}
                  </td>

                  {r.is_group ? (
                    <td colSpan={4} className="px-4 py-2.5 text-xs text-gray-500">
                      <span className="flex flex-wrap items-center gap-3">
                        Time comes from its parts
                        <button
                          onClick={() => { setPickFor(pickFor === r.id ? null : r.id); setPicked(new Set()); setPickQ('') }}
                          className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300"
                        >
                          <ListPlus size={13} /> {pickFor === r.id ? 'Close' : 'Add parts'}
                        </button>
                        {busy === r.id && <Loader2 className="inline h-3.5 w-3.5 animate-spin text-gray-500" />}
                      </span>
                    </td>
                  ) : (
                    <>
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
                      {/* Whether this kind of work has mockups at all, and the
                          time one "+ mockup" adds. Off = no "+ mockup" button
                          on its tasks (banners, posts, video…). */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.allows_mockup !== false}
                            onChange={(e) => void setField(r, { allows_mockup: e.target.checked })}
                            aria-label={`${r.name} uses mockups`}
                            title={r.allows_mockup !== false ? 'Mockups on' : 'No mockups for this work'}
                            className="h-4 w-4 accent-orange-500"
                          />
                          {r.allows_mockup !== false ? (
                            <MinsBox
                              value={r.mockup_minutes ?? 30}
                              label={`Mockup time for ${r.name}`}
                              onSave={(v) => setField(r, { mockup_minutes: v })}
                            />
                          ) : (
                            <span className="text-xs text-gray-600">None</span>
                          )}
                        </div>
                      </td>
                      {/* Time one round of the client's changes adds */}
                      <td className="px-4 py-2.5">
                        <MinsBox
                          value={r.change_minutes ?? 0}
                          label={`Change time for ${r.name}`}
                          allowZero
                          onSave={(v) => setField(r, { change_minutes: v })}
                        />
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
                    </>
                  )}

                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {/* Turn this into a group (Front-Back + Inner Pages…) in one go. */}
                    {!part && !r.is_group && (
                      <button
                        onClick={() => openMake(r)}
                        aria-label={`Make ${r.name} a group`}
                        title="Make group — split it into parts like Brochure"
                        className={`rounded-md p-1.5 hover:bg-[#222] hover:text-orange-300 ${makeFor === r.id ? 'text-orange-300' : 'text-gray-500'}`}
                      >
                        <Layers size={15} />
                      </button>
                    )}
                    {/* A part can be taken back out to stand on its own. */}
                    {part && (
                      <button
                        onClick={() => takeOut(r)}
                        aria-label={`Take ${r.name} out of its group`}
                        title="Take out of the group — it becomes its own kind of work again"
                        className="rounded-md p-1.5 text-gray-500 hover:bg-[#222] hover:text-orange-300"
                      >
                        <Undo2 size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(r)}
                      aria-label={`Remove ${r.name}`}
                      title={part ? 'Remove this part from its group' : 'Remove'}
                      className="rounded-md p-1.5 text-gray-500 hover:bg-[#222] hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>

                {/* Make this a group — parts filled in from Brochure, editable. */}
                {makeFor === r.id && !r.is_group && !part && (
                  <tr className="bg-[#141414]">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-white">
                          Make <span className="font-medium">{r.name}</span> a group
                        </p>
                        {groups.length > 0 && (
                          <label className="ml-auto flex items-center gap-2 text-xs text-gray-400">
                            Same parts as
                            <select
                              defaultValue={(groups.find((g) => g.name.toLowerCase() === 'brochure') ?? groups[0]).id}
                              onChange={(e) => { const p = partsOf(e.target.value); if (p.length) setTpl(p) }}
                              className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-orange-500 focus:outline-none"
                            >
                              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </label>
                        )}
                      </div>

                      <ul className="space-y-1.5">
                        {tpl.map((p, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2">
                            <input
                              value={p.name}
                              onChange={(e) => setTpl((t) => t.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                              placeholder="Part name"
                              aria-label="Part name"
                              className="min-w-[10rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                            />
                            <input
                              type="number"
                              min={1}
                              max={2400}
                              value={p.minutes}
                              onChange={(e) => setTpl((t) => t.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) || 0 } : x)))}
                              aria-label="Minutes"
                              className="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                            />
                            <span className="text-xs text-gray-500">mins</span>
                            <label className="flex items-center gap-1.5 text-xs text-gray-400">
                              <input
                                type="checkbox"
                                checked={p.per_page}
                                onChange={(e) => setTpl((t) => t.map((x, j) => (j === i ? { ...x, per_page: e.target.checked } : x)))}
                                className="h-3.5 w-3.5 accent-orange-500"
                              />
                              per page
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-gray-400">
                              <input
                                type="checkbox"
                                checked={p.mockup}
                                onChange={(e) => setTpl((t) => t.map((x, j) => (j === i ? { ...x, mockup: e.target.checked } : x)))}
                                className="h-3.5 w-3.5 accent-orange-500"
                              />
                              mockup
                            </label>
                            <button
                              onClick={() => setTpl((t) => t.filter((_, j) => j !== i))}
                              aria-label="Remove this part"
                              className="rounded-md p-1 text-gray-600 hover:bg-[#222] hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setTpl((t) => [...t, { name: '', minutes: 30, per_page: false, mockup: true }])}
                          className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] px-2.5 py-1.5 text-xs text-gray-300 hover:text-white"
                        >
                          <Plus size={13} /> Another part
                        </button>
                        <button
                          onClick={() => void makeGroup(r)}
                          disabled={busy === r.id || tpl.every((p) => !p.name.trim())}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
                        >
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                          Make {r.name} a group
                        </button>
                        <button onClick={() => setMakeFor(null)} className="text-xs text-gray-500 hover:text-white">Cancel</button>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        Tasks already done as {r.name} keep their time ({mins(r.minutes)} each). New {r.name} tasks
                        are built from these parts.
                      </p>
                    </td>
                  </tr>
                )}

                {/* Pick several at once and move them into this group. */}
                {r.is_group && pickFor === r.id && (
                  <tr className="bg-[#141414]">
                    <td colSpan={6} className="px-4 py-3">
                      <p className="mb-2 text-xs text-gray-400">
                        Tick the work that belongs inside <span className="text-white">{r.name}</span>.
                        Once inside, it is added on a {r.name} task as a part, and is no longer picked on its own
                        when creating a task. Tasks that already used it are not touched.
                      </p>
                      <div className="relative mb-2 max-w-xs">
                        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                          value={pickQ}
                          onChange={(e) => setPickQ(e.target.value)}
                          placeholder="Search"
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
                        {candidates
                          .filter((c) => c.name.toLowerCase().includes(pickQ.trim().toLowerCase()))
                          .map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 hover:bg-[#1c1c1c]">
                              <input
                                type="checkbox"
                                checked={picked.has(c.id)}
                                onChange={() => setPicked((s) => {
                                  const n = new Set(s)
                                  if (n.has(c.id)) n.delete(c.id)
                                  else n.add(c.id)
                                  return n
                                })}
                                className="h-4 w-4 accent-orange-500"
                              />
                              <span className="min-w-0 flex-1 truncate">{c.name}</span>
                              <span className="shrink-0 text-xs text-gray-600">
                                {c.parent_id ? `in ${nameOf.get(c.parent_id) ?? 'a group'}` : mins(c.minutes)}
                              </span>
                            </label>
                          ))}
                        {candidates.length === 0 && (
                          <p className="px-2 py-1.5 text-sm text-gray-500">Nothing left to add.</p>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => void moveInto(r.id, [...picked])}
                          disabled={picked.size === 0 || busy === r.id}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
                        >
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
                          Add {picked.size || ''} to {r.name}
                        </button>
                        <span className="text-xs text-gray-600">Or drag a row onto the group.</span>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
              {ordered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">Nothing here yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Removed ones — so a mistake here is undone here. */}
        {removed.length > 0 && (
          <div className="border-t border-[#242424]">
            <button
              onClick={() => setShowRemoved((s) => !s)}
              className="w-full px-4 py-2.5 text-left text-xs text-gray-500 hover:text-gray-300"
            >
              {showRemoved ? '▾' : '▸'} Removed ({removed.length})
            </button>
            {showRemoved && (
              <ul className="divide-y divide-[#1f1f1f] pb-1">
                {removed.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="flex-1 text-gray-500">
                      {r.name}
                      {r.parent_id && nameOf.get(r.parent_id) && (
                        <span className="ml-2 text-xs text-gray-600">part of {nameOf.get(r.parent_id)}</span>
                      )}
                      {r.is_group && <span className="ml-2 text-xs text-gray-600">group</span>}
                    </span>
                    {busy === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
                    <button
                      onClick={() => restore(r)}
                      className="flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-gray-300 hover:text-white"
                    >
                      <RotateCcw size={12} /> Bring back
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-300 lg:col-span-2">
            <input
              type="checkbox"
              checked={asGroup}
              onChange={(e) => { setAsGroup(e.target.checked); if (e.target.checked) setPartOf('') }}
              className="h-4 w-4 accent-orange-500"
            />
            <Layers className="h-3.5 w-3.5 text-orange-400" />
            This is a group (like Brochure) — its time comes from its parts
          </label>

          {!asGroup && (
            <>
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

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs text-gray-400">Part of a group</span>
                <select value={partOf} onChange={(e) => setPartOf(e.target.value)} className={input}>
                  <option value="">No — its own kind of work</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
        <div className="border-t border-[#242424] px-5 py-4">
          <button
            onClick={add}
            disabled={busy === 'add'}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {asGroup ? (
              <>Add group</>
            ) : (
              <>
                Add · {mins(hours * 60 + minutes)} per {unit || 'piece'}
                {partOf && <> · part of {nameOf.get(partOf)}</>}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
/*
  A small minutes box that saves when you leave it — the same way the
  "Time for one" box above it works. Mockup time must be at least a
  minute; change time may be 0 (a kind of work where a client's change
  buys no extra time).
*/
function MinsBox({
  value, label, allowZero = false, onSave,
}: {
  value: number
  label: string
  allowZero?: boolean
  onSave: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={allowZero ? 0 : 1}
        max={2400}
        defaultValue={value}
        aria-label={label}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value))
          if (Number.isNaN(v) || v === value) return
          if (v < (allowZero ? 0 : 1)) { e.target.value = String(value); return }
          onSave(v)
        }}
        className="w-16 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none"
      />
      <span className="text-xs text-gray-500">m</span>
    </div>
  )
}