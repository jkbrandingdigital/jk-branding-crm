import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown, ArrowUp, Pause, Play, Trash2, UserPlus, SkipForward, Loader2, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'

type PoolRow = {
  user_id: string;
  full_name: string | null;
  emp_code: string | null;
  branch_name: string | null;
  role: string | null;
  is_active: boolean;
  is_paused: boolean;
  sort_order: number;
  is_next: boolean;
  is_last: boolean;
  rr_today: number;
  rr_30d: number;
};

type Candidate = { user_id: string; full_name: string | null; branch_name: string | null; role: string | null };
type Action = 'add' | 'remove' | 'pause' | 'resume' | 'up' | 'down' | 'set_next';

const roleLabel = (r: string | null) =>
  r === 'branch_manager' ? 'Branch Manager' : r === 'sales' ? 'Sales' : r ?? '—';

export default function LeadAssignment() {
  const { can, ready } = usePermissions()
  const allowed = ready && can('lead_settings')

  const [rows, setRows] = useState<PoolRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pool, cand] = await Promise.all([
      supabase.rpc('lead_pool_list'),
      supabase.rpc('lead_pool_candidates'),
    ]);
    if (pool.error) setMsg({ type: 'err', text: pool.error.message });
    else setRows((pool.data ?? []) as PoolRow[]);
    if (!cand.error) setCandidates((cand.data ?? []) as Candidate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready) return
    if (allowed) load()
    else setLoading(false)
  }, [ready, allowed, load])

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const act = async (action: Action, userId: string, okText: string) => {
    if (action === 'remove' && !confirm('Remove this person from the round robin queue?')) return;
    setBusy(userId + action);
    const { error } = await supabase.rpc('lead_pool_action', { p_action: action, p_user: userId });
    setBusy(null);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    setMsg({ type: 'ok', text: okText });
    if (action === 'add') setPick('');
    load();
  };

  if (!ready) {
    return <div className="p-6 text-gray-400">Loading…</div>
  }

  if (!allowed) {
    return (
      <div className="p-6 text-gray-400">
        You need the <span className="text-white">Lead settings</span> permission to open this page.
        Ask the Super Admin to turn it on in Employees → your name → Permissions.
      </div>
    );
  }

  const next = rows.find((r) => r.is_next);
  const eligible = rows.filter((r) => !r.is_paused && r.is_active).length;
  const todayTotal = rows.reduce((s, r) => s + r.rr_today, 0);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lead Assignment</h1>
          <p className="text-sm text-gray-400 mt-1">
            New leads without an owner are assigned in turn, in this order. Paused and inactive staff are skipped.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-md border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white hover:border-[#3a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Next assignee */}
      <div className="rounded-lg border border-orange-500/40 bg-[#151515] p-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="text-xs text-gray-400">Next lead goes to</div>
          <div className="text-xl font-semibold text-orange-500 mt-0.5">
            {loading ? '…' : next ? next.full_name ?? 'Unnamed' : 'No one'}
          </div>
          {!loading && next && (
            <div className="text-xs text-gray-400">{next.branch_name ?? '—'} · {roleLabel(next.role)}</div>
          )}
        </div>
        <div className="flex gap-8 text-sm">
          <div><div className="text-gray-400 text-xs">In queue</div><div className="text-white">{rows.length}</div></div>
          <div><div className="text-gray-400 text-xs">Active</div><div className="text-white">{eligible}</div></div>
          <div><div className="text-gray-400 text-xs">Assigned today</div><div className="text-white">{todayTotal}</div></div>
        </div>
        {!loading && eligible === 0 && (
          <div className="w-full text-sm text-red-400">
            No one in the queue is active, so new leads will stay unassigned. Resume or add someone.
          </div>
        )}
      </div>

      {msg && (
        <div className={`rounded-md px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Line */}
      <div className="rounded-lg border border-[#242424] bg-[#151515] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-[#242424]">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Today</th>
                <th className="px-4 py-3 text-right">Last 30 days</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  The queue is empty. Add staff below.
                </td></tr>
              )}
              {!loading && rows.map((r, i) => {
                const skipped = r.is_paused || !r.is_active;
                return (
                  <tr
                    key={r.user_id}
                    className={`border-b border-[#242424] last:border-0 ${r.is_next ? 'bg-orange-500/5' : ''} ${skipped ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-white flex items-center gap-2">
                        {r.full_name ?? 'Unnamed'}
                        {r.is_next && <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-medium text-black">Next</span>}
                        {r.is_last && <span className="rounded border border-[#2a2a2a] px-1.5 py-0.5 text-[11px] text-gray-400">Last assigned</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        {[r.emp_code, r.branch_name, roleLabel(r.role)].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {!r.is_active ? <span className="text-red-400">Inactive</span>
                        : r.is_paused ? <span className="text-yellow-400">Paused</span>
                        : <span className="text-green-400">Active</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-white">{r.rr_today}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{r.rr_30d}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconBtn title="Move up" disabled={i === 0} busy={busy === r.user_id + 'up'}
                          onClick={() => act('up', r.user_id, 'Order updated')}><ArrowUp className="h-4 w-4" /></IconBtn>
                        <IconBtn title="Move down" disabled={i === rows.length - 1} busy={busy === r.user_id + 'down'}
                          onClick={() => act('down', r.user_id, 'Order updated')}><ArrowDown className="h-4 w-4" /></IconBtn>
                        {r.is_paused ? (
                          <IconBtn title="Resume" busy={busy === r.user_id + 'resume'}
                            onClick={() => act('resume', r.user_id, 'Resumed')}><Play className="h-4 w-4" /></IconBtn>
                        ) : (
                          <IconBtn title="Pause" busy={busy === r.user_id + 'pause'}
                            onClick={() => act('pause', r.user_id, 'Paused')}><Pause className="h-4 w-4" /></IconBtn>
                        )}
                        <IconBtn title="Make next" disabled={r.is_next || skipped} busy={busy === r.user_id + 'set_next'}
                          onClick={() => act('set_next', r.user_id, `${r.full_name ?? 'This person'} is now next`)}><SkipForward className="h-4 w-4" /></IconBtn>
                        <IconBtn title="Remove from queue" danger busy={busy === r.user_id + 'remove'}
                          onClick={() => act('remove', r.user_id, 'Removed from queue')}><Trash2 className="h-4 w-4" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add */}
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-4">
        <div className="text-white font-medium mb-1">Add staff to the queue</div>
        <p className="text-xs text-gray-400 mb-3">
          New sales staff join the end of the queue automatically. Add branch managers or removed staff here.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-w-[240px] flex-1 max-w-md rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            <option value="">{candidates.length ? 'Select staff' : 'Everyone is already in the queue'}</option>
            {candidates.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.full_name ?? 'Unnamed'} ({c.branch_name ?? '—'}, {roleLabel(c.role)})
              </option>
            ))}
          </select>
          <button
            disabled={!pick || busy === pick + 'add'}
            onClick={() => act('add', pick, 'Added to queue')}
            className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <UserPlus className="h-4 w-4" /> Add to queue
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled, busy, danger,
}: {
  children: React.ReactNode; title: string; onClick: () => void;
  disabled?: boolean; busy?: boolean; danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled || busy}
      className={`rounded-md border border-[#2a2a2a] p-1.5 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${
        danger ? 'hover:text-red-400 hover:border-red-500/40' : 'hover:text-white hover:border-[#3a3a3a]'
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}