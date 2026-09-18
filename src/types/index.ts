export type UserRole = 'super_admin' | 'hr' | 'sales' | 'branch_manager'

export interface Branch {
  id: string
  name: string
  city: string
  is_active: boolean
}

export interface Profile {
  id: string
  emp_code: string
  full_name: string
  phone: string
  branch_id: string
  designation: string
  employee_status: string
  profile_photo_url: string
  branches?: Branch
}

export interface AuthState {
  user: any
  role: UserRole | null
  profile: Profile | null
  loading: boolean
}