import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trophy, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/*
  What to call the first project.

  A lead's "requirement" is sometimes a sentence a sales person typed,
  and sometimes the whole Facebook form pasted in one line:

      …/State?: anilRequirement Type?: packaging_design_&_printing

  Dropping that into the project name gives every Facebook client a
  project called gibberish. So the useful part is pulled out — the answer
  after the last "?:" — and if nothing sensible comes out, the box is
  left empty for the person to type. Empty is honest; wrong is not.
*/
export function projectNameFrom(requirement?: string | null): string {
  const raw = (requirement ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''

  // A form dump: take the answer to the last question in it.
  if (raw.includes('?:')) {
    const answer = raw.slice(raw.lastIndexOf('?:') + 2).replace(/_/g, ' ').trim()
    return answer.length > 0 && answer.length <= 60 ? answer : ''
  }

  // Something a person wrote. Long means it is a note, not a name.
  return raw.length <= 60 ? raw : ''
}

/*
  Turning a won lead into a customer.

  It asks. It does not happen behind anyone's back when a card is dragged
  into Won, because a card gets dragged there by mistake often enough, and
  a customer that appeared on its own is worse than one that is missing —
  nobody knows who made it or whether it is real.

  The first project's name starts as whatever the lead's requirement said.
  Sales already wrote that down; asking again throws their work away.
*/

export async function convertLead(leadId: string, projectTitle: string): Promise<string> {
  const { data, error } = await supabase.rpc('lead_to_customer', {
    p_lead_id: leadId,
    p_project_title: projectTitle.trim() || null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export default function ConvertLead({
  leadId, leadName, requirement, onClose, onDone,
}: {
  leadId: string
  leadName: string
  requirement?: string | null
  onClose: () => void
  onDone: (customerId: string) => void
}) {
  const [title, setTitle] = useState(projectNameFrom(requirement))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function go() {
    setBusy(true)
    setErr('')
    try {
      onDone(await convertLead(leadId, title))
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Trophy size={16} className="text-orange-400" /> Deal won
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-gray-300">
            Make <span className="font-medium text-white">{leadName}</span> a customer and open their first project?
          </p>

          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div>
            <label className="mb-1.5 block text-xs text-gray-500">First project</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void go() }}
              placeholder="Logo design"
              autoFocus
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-gray-600">
              More work for this client goes on the same customer later — a brochure, a website — each as its
              own project.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            Name, phone and email come across from the lead. The client information opens next.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Not yet
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            Create customer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}