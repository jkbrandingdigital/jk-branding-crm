// src/pages/design/MyPayslips.tsx
//
// A person's own payslips. Route: /design/my-payslips
//
// No permission and no Guard. It is the record of what you were paid.

import DesignLayout from '../../components/DesignLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function DesignMyPayslipsPage() {
  return (
    <DesignLayout>
      <MyPayslips />
    </DesignLayout>
  )
}