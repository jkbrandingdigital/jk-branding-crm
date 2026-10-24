// src/pages/manager/MyPayslips.tsx
//
// A person's own payslips. Route: /manager/my-payslips
//
// No permission and no Guard. It is the record of what you were paid.

import ManagerLayout from '../../components/ManagerLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function ManagerMyPayslipsPage() {
  return (
    <ManagerLayout>
      <MyPayslips />
    </ManagerLayout>
  )
}