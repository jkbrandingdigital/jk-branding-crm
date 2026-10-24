// src/pages/manager/MyLeave.tsx
//
// A person's own leave. Route: /manager/my-leave
//
// No permission and no Guard. Seeing your own leave — and what it costs
// you — is not a privilege; it is the thing your pay is worked out from.
// Same reasoning that left My attendance unswitched.

import ManagerLayout from '../../components/ManagerLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function ManagerMyLeavePage() {
  return (
    <ManagerLayout>
      <MyLeave />
    </ManagerLayout>
  )
}