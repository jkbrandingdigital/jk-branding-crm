// src/pages/hr/MyLeave.tsx
//
// A person's own leave. Route: /hr/my-leave
//
// No permission and no Guard. Seeing your own leave — and what it costs
// you — is not a privilege; it is the thing your pay is worked out from.
// Same reasoning that left My attendance, My leads and My performance
// unswitched.

import HrLayout from '../../components/HrLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function HrMyLeavePage() {
  return (
    <HrLayout>
      <MyLeave />
    </HrLayout>
  )
}