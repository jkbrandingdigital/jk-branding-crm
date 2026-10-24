// src/pages/hr/MyPayslips.tsx
//
// A person's own payslips. Route: /hr/my-payslips
//
// No permission and no Guard. It is the record of what you were paid.

import HrLayout from '../../components/HrLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function HrMyPayslipsPage() {
  return (
    <HrLayout>
      <MyPayslips />
    </HrLayout>
  )
}