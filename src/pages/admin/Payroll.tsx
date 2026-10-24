// src/pages/admin/Payroll.tsx
//
// Payroll, in the admin area. Route: /admin/payroll
//
// The same board HR uses — see the note in Leaves.tsx.
//
// Worth knowing: the super admin can run payroll AND approve it, and
// the database still refuses to let anybody approve a month they
// submitted themselves. So a one-person company can prepare a month
// here, but somebody else has to sign it off.

import AdminLayout from '../../components/AdminLayout'
import PayrollBoard from '../../components/payroll/PayrollBoard'

export default function AdminPayrollPage() {
  return (
    <AdminLayout>
      <PayrollBoard />
    </AdminLayout>
  )
}