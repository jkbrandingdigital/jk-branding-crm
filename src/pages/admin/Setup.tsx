// src/pages/admin/Setup.tsx
//
// Salaries, holidays and the attendance rules. Route: /admin/setup
//
// Payroll is worked out from a salary and a calendar, and both are set
// here. Without this page in the admin area the super admin can run a
// month but cannot put a salary behind it.

import AdminLayout from '../../components/AdminLayout'
import HrSetup from '../../components/hr/HrSetup'

export default function AdminSetupPage() {
  return (
    <AdminLayout>
      <HrSetup />
    </AdminLayout>
  )
}