import { supabase } from './supabase'

// The Digital role's own side of the CRM (/dm). /digital is the
// client-workspace screen, which other roles with the switch open too.
export const DM_HOME = '/dm'

// A project this person runs — picked as "Who is running it" on the
// project. No money: dm_my_projects() takes those columns out.
export type DmProject = {
  id: string
  project_code: string
  title: string
  customer_id: string
  customer_name: string
  customer_code?: string | null
  stage_name?: string | null
  is_done?: boolean | null
  is_rejected?: boolean | null
  due_date: string | null
  start_date?: string | null
  service_keys?: string[] | null
  workspace_id: string | null
  open_tasks: number
}

export async function loadMyProjects(): Promise<DmProject[]> {
  const { data, error } = await supabase.rpc('dm_my_projects')
  if (error) throw new Error(error.message)
  return (data ?? []) as DmProject[]
}