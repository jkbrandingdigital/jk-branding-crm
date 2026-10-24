// src/pages/manager/Attendance.tsx
//
// The branch's register. Route: /manager/attendance
//
// The same board HR and the admin area use. What it shows is narrowed
// by the DATABASE, not by this page: attendance_scope() answers 'branch'
// for a branch manager and the board, the tiles, the week and the row
// policies all ask that one question. So a Rajkot manager opening this
// page sees Rajkot, and asking for Delhi by name gives an empty list
// rather than somebody else's register.

import ManagerLayout from '../../components/ManagerLayout'
import AttendanceBoard from '../../components/attendance/AttendanceBoard'
import { usePermissions } from '../../lib/permissions'

export default function ManagerAttendancePage() {
  const { can, ready, isSuper } = usePermissions()

  return (
    <ManagerLayout>
      {!ready ? (
        <p className="py-16 text-center text-sm text-gray-600">One moment…</p>
      ) : isSuper || can('attendance_view_branch') || can('attendance_view_all') ? (
        <AttendanceBoard />
      ) : (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-lg font-medium">Branch attendance</h1>
          <p className="mt-2 text-sm text-gray-500">
            This one is not switched on for you. Your own days are under{' '}
            <span className="text-gray-300">My attendance</span>.
          </p>
        </div>
      )}
    </ManagerLayout>
  )
}