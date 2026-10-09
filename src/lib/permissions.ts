import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Perms = Record<string, boolean>

// Logged-in user's rights (role defaults + personal toggles).
//
//  all          → Super Admin. Everything, always.
//  is_subadmin  → may open the admin area. It is NOT a master key:
//                 what they find inside is decided switch by switch,
//                 from Employees → "What they can open".
export function usePermissions() {
  const [perms, setPerms] = useState<Perms | null>(null)

  useEffect(() => {
    let alive = true

    const read = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (alive) setPerms({})
        return
      }
      const { data } = await supabase.rpc('my_permissions')
      if (alive) setPerms((data as Perms) ?? {})
    }

    read()

    // Logging in happens after this hook mounts, so read the rights again
    // once the session is there. setTimeout keeps the Supabase client out
    // of its own callback.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        setTimeout(() => { if (alive) read() }, 0)
      }
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const isSuper = perms?.all === true
  const isSubAdmin = perms?.is_subadmin === true
  const can = (key: string) => !!perms && (perms.all === true || perms[key] === true)

  return {
    perms,
    can,
    ready: perms !== null,
    isSuper,
    isSubAdmin,
    // Who gets the admin sidebar at all
    adminArea: isSuper || isSubAdmin,
  }
}

// The person's own side of the CRM — their daily work, whatever extra
// admin rights they may also have.
export const ownHome = (role: string | null | undefined) =>
  role === 'super_admin' ? '/admin'
  : role === 'hr' ? '/hr'
  : role === 'branch_manager' ? '/manager'
  : role === 'design_team' ? '/design'
  : '/sales'

// Every right the app knows about, grouped for the toggles screen
export const PERMISSION_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: 'Leads',
    items: [
      { key: 'lead_view_all', label: 'View all leads' },
      { key: 'lead_create', label: 'Add lead' },
      { key: 'lead_edit', label: 'Edit lead' },
      { key: 'lead_delete', label: 'Delete lead' },
      { key: 'lead_assign', label: 'Transfer / assign' },
      { key: 'lead_export', label: 'Export' },
      { key: 'lead_import', label: 'Import' },
      { key: 'lead_settings', label: 'Lead settings' },
    ],
  },
]