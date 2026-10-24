// src/pages/admin/Leaves.tsx
//
// Leave approvals, in the admin area. Route: /admin/leaves
//
// The same board HR uses. One screen, two doors — not two screens that
// have to be kept in step. What a person may do inside it is decided by
// the database (can_approve_leave), so the super admin and HR see the
// same thing because they are allowed the same thing.

import AdminLayout from '../../components/AdminLayout'
import LeaveBoard from '../../components/leave/LeaveBoard'

export default function AdminLeavesPage() {
  return (
    <AdminLayout>
      <LeaveBoard />
    </AdminLayout>
  )
}