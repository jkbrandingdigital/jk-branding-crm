// src/pages/hr/Payroll.tsx
//
// Running payroll. Route: /hr/payroll
//
// The page checks the right itself rather than being wrapped in a Guard:
// the database already refuses (payroll_open, payroll_build and the rest
// all ask can_run_payroll()), so a guard here is politeness, and it is
// kept beside the thing it guards so the two cannot drift apart.

import HrLayout from '../../components/HrLayout'
import PayrollBoard from '../../components/payroll/PayrollBoard'
import { usePermissions } from '../../lib/permissions'

export default function HrPayrollPage() {
  const { can, ready, isSuper } = usePermissions()

  return (
    <HrLayout>
      {!ready ? (
        <p className="py-16 text-center text-sm text-gray-600">One moment…</p>
      ) : isSuper || can('mod_payroll') ? (
        <PayrollBoard />
      ) : (
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-lg font-medium">Payroll</h1>
          <p className="mt-2 text-sm text-gray-500">
            This one is not switched on for you. Your own payslips are under{' '}
            <span className="text-gray-300">My payslips</span>.
          </p>
        </div>
      )}
    </HrLayout>
  )
}