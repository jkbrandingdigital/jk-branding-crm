// src/pages/sales/MyLeave.tsx
//
// A sales person's own leave. Route: /sales/my-leave
//
// SalesLayout asks for `active` — it lights the menu row itself from
// that, rather than from the address bar the way the other layouts do.
// So the page has to name which row it is, and 'my-leave' has to exist
// in SalesNav and OWN_ROUTE for the row to point anywhere.
//
// No permission and no Guard. Seeing your own leave — and what it costs
// you — is not a privilege; it is the thing your pay is worked out from.

import SalesLayout from '../../components/SalesLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function SalesMyLeavePage() {
  return (
    <SalesLayout active="my-leave">
      <MyLeave />
    </SalesLayout>
  )
}