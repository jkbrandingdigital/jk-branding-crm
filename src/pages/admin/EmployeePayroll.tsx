// src/pages/admin/EmployeePayroll.tsx
//
// One person's payroll. Route: /admin/payroll/:id
//
// The same component behind both doors, so HR and the super admin
// cannot be looking at two different versions of one person's pay.

import { useNavigate, useParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import EmployeePayroll from '../../components/payroll/EmployeePayroll'

export default function AdminEmployeePayrollPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  return (
    <AdminLayout>
      {id
        ? <EmployeePayroll userId={id} onBack={() => navigate('/admin/payroll')} />
        : <p className="py-20 text-center text-sm text-gray-600">No employee chosen.</p>}
    </AdminLayout>
  )
}