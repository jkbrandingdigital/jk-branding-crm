// src/pages/sales/MyPayslips.tsx
//
// A person's own payslips. Route: /sales/my-payslips
//
// No permission and no Guard. It is the record of what you were paid.

import SalesLayout from '../../components/SalesLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function SalesMyPayslipsPage() {
  return (
    <SalesLayout active="my-payslips">
      <MyPayslips />
    </SalesLayout>
  )
}