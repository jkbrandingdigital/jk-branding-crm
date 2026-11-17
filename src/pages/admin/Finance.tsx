// src/pages/admin/Finance.tsx — Route: /admin/finance
// The same board Accounts uses. The database lets the super admin see it.
import AdminLayout from '../../components/AdminLayout'
import FinanceBoard from '../../components/finance/FinanceBoard'

export default function AdminFinance() {
  return (
    <AdminLayout>
      <FinanceBoard />
    </AdminLayout>
  )
}
