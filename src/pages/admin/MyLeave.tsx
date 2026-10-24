// src/pages/admin/MyLeave.tsx
//
// A person's own leave. Route: /admin/my-leave
//
// No permission and no Guard. Seeing your own leave — and what it costs
// you — is not a privilege; it is the thing your pay is worked out from.
// Same reasoning that left My attendance unswitched.

import AdminLayout from '../../components/AdminLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function AdminMyLeavePage() {
  return (
    <AdminLayout>
      <MyLeave />
    </AdminLayout>
  )
}