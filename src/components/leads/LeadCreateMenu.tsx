import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlarmClock, CalendarClock, FileText, ListTodo, Loader2, MoreVertical, StickyNote,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import TaskModal from '../tasks/TaskModal'
import { loadTaskLabels, loadTaskStages, type TaskLabel, type TaskStage } from '../tasks/taskUtils'
import ReminderModal from '../reminders/ReminderModal'
import NoteModal from '../notes/NoteModal'
import type { LeadLite } from '../reminders/reminderUtils'
import type { Staff } from './leadUtils'

/*
  Everything you can start from a lead — task, meeting, quotation,
  reminder, note.

  It lives here, as one piece, because it is offered in two places: the
  ⋮ on a board card and the ⋮ inside an open lead. Written twice it
  would be right twice today and wrong once in a month, when a sixth
  thing is added to one copy and not the other.

  The button, the list and the three windows it opens all travel
  together. A caller that wants the list gets the windows with it and
  has nothing to wire up.
*/

export default function LeadCreateMenu({
  lead, staff, can, size = 17, align = 'right', drop = 'down', onDone, className = '',
}: {
  lead: LeadLite
  staff: Staff[]
  can: (k: string) => boolean
  size?: number
  align?: 'left' | 'right'
  // 'up' on a board card: the column scrolls, and a list dropping below
  // the last card is cut off by it. The card's other menus open upward
  // for the same reason.
  drop?: 'down' | 'up'
  // Said after something is made, so the caller can show its own message.
  onDone?: (text: string) => void
  className?: string
}) {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [open, setOpen] = useState(false)
  const [make, setMake] = useState<'task' | 'reminder' | 'note' | null>(null)
  const [taskStages, setTaskStages] = useState<TaskStage[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabel[]>([])
  const [loadingTask, setLoadingTask] = useState(false)
  const [err, setErr] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  // Quotations live under each role's own folder
  const quoteBase =
    role === 'super_admin' ? '/admin' : role === 'branch_manager' ? '/manager' : role === 'sales' ? '/sales' : null

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  // Task stages and labels are fetched the first time, not on every card.
  // A board holds forty of these; loading them up front would be forty
  // queries for a menu most people never open.
  async function startTask() {
    setOpen(false)
    if (taskStages.length) return setMake('task')
    setLoadingTask(true)
    try {
      const [s, l] = await Promise.all([loadTaskStages(), loadTaskLabels()])
      setTaskStages(s)
      setTaskLabels(l)
      setMake('task')
    } catch (e) {
      setErr((e as Error).message)
    }
    setLoadingTask(false)
  }

  const done = (text: string) => { setMake(null); onDone?.(text) }

  return (
    <div ref={boxRef} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={err || 'Create task, quotation, reminder…'}
        className={`rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#1f1f1f] hover:text-white ${
          open ? 'bg-[#1f1f1f] text-white' : ''
        }`}
      >
        {loadingTask ? <Loader2 size={size} className="animate-spin" /> : <MoreVertical size={size} />}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-40 w-56 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${drop === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <MenuItem icon={ListTodo} label="Create Task" show={can('task_create')} onClick={startTask} />
          <MenuItem icon={CalendarClock} label="Create Meeting" soon />
          <MenuItem
            icon={FileText}
            label="Create Quotation"
            show={can('quote_create') && !!quoteBase}
            onClick={() => { setOpen(false); navigate(`${quoteBase}/quotations/new?lead=${lead.id}`) }}
          />
          <MenuItem icon={AlarmClock} label="Set Reminder" show={can('mod_reminders')} onClick={() => { setOpen(false); setMake('reminder') }} />
          <MenuItem icon={StickyNote} label="Create Notes" show={can('mod_notes')} onClick={() => { setOpen(false); setMake('note') }} />
        </div>
      )}

      {make === 'task' && (
        <TaskModal
          task={null}
          stages={taskStages}
          labels={taskLabels}
          staff={staff}
          lead={lead}
          onClose={() => setMake(null)}
          onSaved={() => done('Task created.')}
        />
      )}

      {make === 'reminder' && (
        <ReminderModal
          reminder={null}
          staff={staff}
          lead={lead}
          onClose={() => setMake(null)}
          onSaved={() => done('Reminder set.')}
        />
      )}

      {make === 'note' && (
        <NoteModal
          note={null}
          leadId={lead.id}
          leadName={`#${lead.lead_no} ${lead.name}`}
          onClose={() => setMake(null)}
          onSaved={() => done('Note saved.')}
        />
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon, label, show = true, soon, onClick,
}: {
  icon: typeof ListTodo
  label: string
  show?: boolean
  soon?: boolean
  onClick?: () => void
}) {
  if (!show) return null
  if (soon) {
    return (
      <span className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-600">
        <Icon size={15} />
        <span className="flex-1">{label}</span>
        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
      </span>
    )
  }
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#232323] hover:text-white"
    >
      <Icon size={15} className="text-orange-400" />
      {label}
    </button>
  )
}