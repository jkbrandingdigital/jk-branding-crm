import { inr } from './financeUtils'
import { useMaster } from '../../lib/master'

/*
  GST when a deal is made — the new-project form and Lead → Customer.
  Three choices: No GST, 18% on the whole price, or Split: part of the
  price billed with 18% GST and the rest without (Fin_F8 / Fin_F9).

  On a project that already exists, GST and the split are changed from
  its Payment box instead, which checks who and logs it.

  Split is offered only while the private view is open (Fin_F10); the
  database ignores W from anyone else.
*/

export type GstPick = { gst: number; split: boolean; nongst: string }

export const NO_GST: GstPick = { gst: 0, split: false, nongst: '' }

// Nothing picked yet. A form starts here, so No GST is never chosen by
// leaving the default alone — a No GST deal goes to the owner in Finance
// (Fin_F13), so it has to be a deliberate click.
export const UNPICKED: GstPick = { gst: -1, split: false, nongst: '' }

// W to save: 0 unless split.
export function pickNongst(p: GstPick): number {
  return p.gst > 0 && p.split ? Math.round((Number(p.nongst) || 0) * 100) / 100 : 0
}

// What is wrong with the choice for this price, or null if it is fine.
export function pickProblem(p: GstPick, base: number): string | null {
  if (p.gst < 0) return 'Choose GST: No GST or 18%.'
  if (!(p.gst > 0 && p.split)) return null
  const n = Number(p.nongst)
  if (p.nongst.trim() === '' || !(n > 0)) return 'How much is W?'
  if (base > 0 && n >= base) return 'That is the whole price. Choose No GST instead of splitting.'
  return null
}

export default function GstChoice({ base, pick, onChange }: {
  base: number
  pick: GstPick
  onChange: (p: GstPick) => void
}) {
  const { open: master } = useMaster()
  const now: 'unset' | 'none' | 'full' | 'split' =
    pick.gst < 0 ? 'unset' : pick.gst === 0 ? 'none' : pick.split && master ? 'split' : 'full'
  const btn = (on: boolean) =>
    `rounded-md px-2.5 py-1 text-xs ${on ? 'bg-orange-500/15 text-orange-300' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'}`

  const nongst = pickNongst(pick)
  const gstBase = Math.max(base - nongst, 0)
  const gstAmt = Math.round(gstBase * pick.gst) / 100
  const problem = base > 0 && pick.gst >= 0 ? pickProblem(pick, base) : null

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => onChange(NO_GST)} className={btn(now === 'none')} aria-pressed={now === 'none'}>No GST</button>
        <button type="button" onClick={() => onChange({ gst: 18, split: false, nongst: '' })} className={btn(now === 'full')} aria-pressed={now === 'full'}>18%</button>
        {master && (
          <button type="button" onClick={() => onChange({ gst: 18, split: true, nongst: pick.nongst })} className={btn(now === 'split')} aria-pressed={now === 'split'}>
            Split
          </button>
        )}
      </div>

      {now === 'split' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-400" htmlFor="gst-choice-nongst">W ₹</label>
          <input
            id="gst-choice-nongst"
            type="number" min={0} step="0.01"
            value={pick.nongst}
            onChange={(e) => onChange({ ...pick, nongst: e.target.value })}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-28 rounded-md border border-[#2a2a2a] bg-[#151515] px-2 py-1 text-xs tabular-nums text-white"
          />
        </div>
      )}

      {pick.gst > 0 && base > 0 && !problem && (
        <p className="mt-1.5 text-xs text-gray-500">
          {nongst > 0
            ? <>GST bill {inr(gstBase)} + 18% = {inr(gstBase + gstAmt, true)} · W {inr(nongst)} · client pays {inr(base + gstAmt, true)}</>
            : <>Client pays {inr(base + gstAmt, true)} with GST.</>}
        </p>
      )}
      {now === 'unset' && <p className="mt-1.5 text-xs text-gray-500">Pick one.</p>}
      {now === 'split' && problem && pick.nongst.trim() !== '' && (
        <p className="mt-1.5 text-xs text-amber-400">{problem}</p>
      )}
    </div>
  )
}