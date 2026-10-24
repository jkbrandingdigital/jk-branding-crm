// src/pages/hr/EmployeePayroll.tsx
//
// One person's payroll. Route: /hr/payroll/:id
//
// The same component behind both doors, so HR and the super admin
// cannot be looking at two different versions of one person's pay.

import { useNavigate, useParams } from 'react-router-dom'
import HrLayout from '../../components/HrLayout'
import EmployeePayroll from '../../components/payroll/EmployeePayroll'

export default function HrEmployeePayrollPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <HrLayout>
      {id
        ? <EmployeePayroll userId={id} onBack={() => navigate('/hr/payroll')} />
        : <p className="py-20 text-center text-sm text-gray-600">No employee chosen.</p>}
    </HrLayout>
  )
}