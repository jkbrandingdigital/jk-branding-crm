import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Perms = Record<string, boolean>

// Logged-in user's rights (role defaults + personal toggles). Super Admin gets { all: true }.
export function usePermissions() {
  const [perms, setPerms] = useState<Perms | null>(null)

  useEffect(() => {
    supabase.rpc('my_permissions').then(({ data }) => setPerms((data as Perms) ?? {}))
  }, [])

  const can = (key: string) => !!perms && (perms.all === true || perms.is_subadmin === true || perms[key] === true)
  return { perms, can, ready: perms !== null }
}

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