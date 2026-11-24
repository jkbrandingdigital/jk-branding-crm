import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Digital — types, platform names, and every call the screens make.
// Writes go through RPCs (Digital_DG3 / DG3b) and the digital-connect edge
// function; nothing writes a table directly.
// ---------------------------------------------------------------------------

export type Platform =
  | 'facebook_page' | 'instagram_business' | 'threads'
  | 'facebook_group' | 'facebook_profile' | 'instagram_personal'

export type ConnectPlatform = 'facebook_page' | 'instagram_business'

// lucide has no brand icons, so each platform is a small coloured badge.
export const PLATFORM: Record<Platform, { label: string; sub: string; short: string; badge: string; mode: 'direct' | 'notify' }> = {
  facebook_page:      { label: 'Facebook Page',        sub: 'Posts go out from the CRM',          short: 'f',  badge: 'bg-[#1877f2] text-white', mode: 'direct' },
  instagram_business: { label: 'Instagram Business',   sub: 'Posts go out from the CRM',          short: 'IG', badge: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white', mode: 'direct' },
  threads:            { label: 'Threads',              sub: 'Coming soon',                         short: '@',  badge: 'bg-black text-white ring-1 ring-[#333]', mode: 'direct' },
  facebook_group:     { label: 'Facebook Group',       sub: 'Reminder to post by hand',            short: 'f',  badge: 'bg-[#1877f2]/70 text-white', mode: 'notify' },
  facebook_profile:   { label: 'Facebook Profile',     sub: 'Reminder to post by hand',            short: 'f',  badge: 'bg-[#1877f2]/70 text-white', mode: 'notify' },
  instagram_personal: { label: 'Instagram Personal',   sub: 'Reminder to post by hand',            short: 'IG', badge: 'bg-gradient-to-br from-[#f58529]/70 via-[#dd2a7b]/70 to-[#8134af]/70 text-white', mode: 'notify' },
}

export const MANUAL_PLATFORMS: Platform[] = ['facebook_group', 'facebook_profile', 'instagram_personal']

export type WorkspaceRow = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  customer_id: string
  company_name: string
  code: string
  connected: number
  expired: number
  scheduled: number
  members: number
  is_member: boolean
}

export type AccountStatus = 'connected' | 'expired' | 'paused' | 'disconnected'

export type Account = {
  id: string
  platform: Platform
  mode: 'direct' | 'notify'
  name: string
  username: string | null
  picture_url: string | null
  url: string | null
  status: AccountStatus
  last_error: string | null
  connected_via: 'team' | 'client_link' | 'manual'
  connected_at: string
  connected_fb_name?: string | null
  connected_fb_id?: string | null
  connected_by_name?: string | null
}

export type Person = { id: string; full_name: string; emp_code: string; department?: string | null; designation?: string | null }

export type WorkspaceDetail = {
  id: string
  name: string
  color: string | null
  is_active: boolean
  created_at: string
  customer: { id: string; company_name: string; code: string; contact_person: string | null; phone: string | null; whatsapp: string | null; email: string | null }
  members: Person[]
  accounts: Account[]
  rights: { manage: boolean; connect: boolean; create: boolean; publish: boolean }
}

export type Invite = {
  id: string
  path: string
  platforms: ConnectPlatform[]
  created_at: string
  expires_at: string
  revoked_at: string | null
  used_count: number
  last_used_at: string | null
  single_use: boolean
  created_by: string | null
  live: boolean
  ended: 'used' | 'revoked' | 'expired' | null
}

export type InviteInfo =
  | { ok: true; company_name: string; workspace: string; platforms: ConnectPlatform[]; expires_at: string }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'used'; company_name?: string }

export type FreeCustomer = { id: string; customer_no: number; code: string; company_name: string; contact_person: string | null; phone: string | null }

export type PendingAccount = {
  id: string
  platform: ConnectPlatform
  external_id: string
  parent_external_id: string | null
  name: string
  username: string | null
  picture_url: string | null
  state: 'new' | 'here' | 'elsewhere'
}

export type ConnectResult = { name: string; platform: ConnectPlatform; ok: boolean; error?: string }

// ---------------------------------------------------------------------------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const digitalApi = {
  workspaces: () => rpc<WorkspaceRow[]>('digital_workspaces'),
  workspace: (id: string) => rpc<WorkspaceDetail>('digital_workspace', { p_ws: id }),
  staff: () => rpc<Person[]>('digital_staff'),
  customersFree: (q: string) => rpc<FreeCustomer[]>('digital_customers_free', { p_q: q || null }),
  quickAddCustomer: (company: string, contact: string, phone: string, email: string) =>
    rpc<FreeCustomer>('digital_customer_quick_add', { p_company: company, p_contact: contact, p_phone: phone, p_email: email }),
  createWorkspace: (customerId: string, name: string, members: string[]) =>
    rpc<{ id: string }>('digital_workspace_create', { p_customer: customerId, p_name: name || null, p_members: members }),
  updateWorkspace: (id: string, fields: { name?: string; color?: string; active?: boolean }) =>
    rpc('digital_workspace_update', { p_ws: id, p_name: fields.name ?? null, p_color: fields.color ?? null, p_active: fields.active ?? null }),
  memberSet: (ws: string, user: string, on: boolean) => rpc('digital_member_set', { p_ws: ws, p_user: user, p_on: on }),
  invites: (ws: string) => rpc<Invite[]>('digital_invites', { p_ws: ws }),
  inviteCreate: (ws: string, platforms: ConnectPlatform[], days: number, singleUse: boolean) =>
    rpc<{ id: string; token: string; path: string; expires_at: string; single_use: boolean }>(
      'digital_invite_create', { p_ws: ws, p_platforms: platforms, p_days: days, p_single_use: singleUse }),
  inviteRevoke: (id: string) => rpc('digital_invite_revoke', { p_id: id }),
  inviteInfo: (token: string) => rpc<InviteInfo>('digital_invite_info', { p_token: token }),
  addManual: (ws: string, platform: Platform, name: string, url: string) =>
    rpc<{ id: string }>('digital_account_add_manual', { p_ws: ws, p_platform: platform, p_name: name, p_url: url || null }),
  disconnect: (id: string) => rpc('digital_account_disconnect', { p_id: id }),
  pause: (id: string, paused: boolean) => rpc('digital_account_pause', { p_id: id, p_paused: paused }),
}

// The digital-connect edge function. Its own error text is in the response
// body; supabase-js hides that behind "non-2xx status", so dig it out.
export async function connectFn<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('digital-connect', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json()
        if (j?.error) msg = j.error
      }
    } catch { /* keep the generic message */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

// Send the browser to Facebook. return_path is where Facebook brings it back.
export async function startFacebook(args: { workspaceId?: string; invite?: string; platforms?: ConnectPlatform[]; returnPath: string }) {
  const res = await connectFn<{ url: string }>({
    action: 'start',
    workspace_id: args.workspaceId,
    invite: args.invite,
    platforms: args.platforms,
    origin: window.location.origin,
    return_path: args.returnPath,
  })
  window.location.href = res.url
}

export const fullLink = (path: string) => `${window.location.origin}${path}`

// wa.me wants the number with the country code and nothing else.
export function waLink(phone: string | null | undefined, text: string) {
  let n = (phone ?? '').replace(/\D/g, '')
  if (n.length === 10) n = `91${n}`
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

export function inviteMessage(contact: string | null | undefined, url: string) {
  return [
    `Hello${contact ? ` ${contact}` : ''},`,
    '',
    'Please open this link to connect your Facebook page / Instagram with JK Branding, so we can post for you:',
    url,
    '',
    'You log in to your own Facebook and press Allow. We never ask for your password, and you can remove access from Facebook at any time.',
  ].join('\n')
}

export const LAST_WS_KEY = 'jk_digital_ws'
