// src/pages/admin/FinanceDashboard.tsx — Route: /admin/finance
import AdminLayout from '../../components/AdminLayout'
import FinanceDashboard from '../../components/finance/FinanceDashboard'

export default function AdminFinanceDashboard() {
  return (
    <AdminLayout>
      <FinanceDashboard area="admin" />
    </AdminLayout>
  )
}
