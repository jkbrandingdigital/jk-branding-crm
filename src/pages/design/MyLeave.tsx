// src/pages/design/MyLeave.tsx
//
// A person's own leave. Route: /design/my-leave
//
// No permission and no Guard. Seeing your own leave — and what it costs
// you — is not a privilege; it is the thing your pay is worked out from.
// Same reasoning that left My attendance unswitched.

import DesignLayout from '../../components/DesignLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function DesignMyLeavePage() {
  return (
    <DesignLayout>
      <MyLeave />
    </DesignLayout>
  )
}