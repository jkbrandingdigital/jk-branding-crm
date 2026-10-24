// src/pages/hr/Setup.tsx
//
// Salaries, holidays and the attendance rules. Route: /hr/setup
//
// The page guards itself rather than being wrapped in a Guard: the three
// cards inside each answer to a different right (payroll, attendance_edit),
// and the database answers all three in one call. A route-level guard
// would have to pick one of them and would be wrong about the other two.

import HrLayout from '../../components/HrLayout'
import HrSetup from '../../components/hr/HrSetup'

export default function HrSetupPage() {
  return (
    <HrLayout>
      <HrSetup />
    </HrLayout>
  )
}