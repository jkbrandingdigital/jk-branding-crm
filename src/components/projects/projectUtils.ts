import { supabase } from '../../lib/supabase'

/*
  The short list of projects, for screens that only need to point at one.

  The project screens themselves read `project_list` straight, through the
  types in customers/customerUtils. This is the small version: enough to
  fill a dropdown and nothing more.

  The old file of this name was written when a project carried the client's
  name as plain text and had no customer behind it. That model is gone —
  a project now hangs off a customer — so this is written against the new
  view rather than patched.
*/

export type ProjectLite = {
  id: string
  project_no: number
  name: string
  customer_name: string | null
  is_done: boolean
}

export async function loadProjectsLite(): Promise<ProjectLite[]> {
  const { data } = await supabase
    .from('project_list')
    .select('id, project_no, title, customer_name, is_done')
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as {
    id: string; project_no: number; title: string
    customer_name: string | null; is_done: boolean | null
  }[]

  // `title` here, `name` on the picker. The picker was written first and
  // several screens read it, so the loader does the renaming once rather
  // than every screen doing it.
  return rows.map((r) => ({
    id: r.id,
    project_no: r.project_no,
    name: r.title,
    customer_name: r.customer_name,
    is_done: !!r.is_done,
  }))
}