// src/pages/admin/MyPayslips.tsx
//
// A person's own payslips. Route: /admin/my-payslips
//
// No permission and no Guard. It is the record of what you were paid.

import AdminLayout from '../../components/AdminLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function AdminMyPayslipsPage() {
  return (
    <AdminLayout>
      <MyPayslips />
    </AdminLayout>
  )
}