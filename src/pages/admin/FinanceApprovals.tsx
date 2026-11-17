// src/pages/admin/FinanceApprovals.tsx — the same screen Accounts uses.
import AdminLayout from '../../components/AdminLayout'
import PriceRequests from '../../components/finance/PriceRequests'

export default function AdminFinanceApprovals() {
  return (
    <AdminLayout>
      <PriceRequests />
    </AdminLayout>
  )
}
