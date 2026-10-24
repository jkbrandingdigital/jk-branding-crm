// src/pages/hr/Leaves.tsx
//
// HR's leave screen. Route: /hr/leaves
//
// The page checks the permission itself instead of being wrapped in a
// Guard. Two reasons, and the second is the real one:
//
//   The database already refuses — leaves_waiting() and leave_decide()
//   both ask can_approve_leave() before they answer. A guard in the app
//   is politeness, not protection, so where it lives is a matter of
//   where it reads best.
//
//   And a page that carries its own answer cannot drift from the route
//   that points at it. A Guard in App.tsx is a second place to keep the
//   permission key in step with this file; the same split cost us a
//   whole evening on Hr_HR11, where a policy asked for one key and the
//   function it protected asked for another.

import HrLayout from '../../components/HrLayout'
import LeaveBoard from '../../components/leave/LeaveBoard'
import { usePermissions } from '../../lib/permissions'

export default function HrLeavesPage() {
  const { can, ready, isSuper } = usePermissions()

  return (
    <HrLayout>
      {!ready ? (
        <p className="py-16 text-center text-sm text-gray-600">One moment…</p>
      ) : isSuper || can('leave_approve') ? (
        <LeaveBoard />
      ) : (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-lg font-medium">Leave approvals</h1>
          <p className="mt-2 text-sm text-gray-500">
            This one is not switched on for you. Your own leave is under{' '}
            <span className="text-gray-300">My leave</span>.
          </p>
        </div>
      )}
    </HrLayout>
  )
}