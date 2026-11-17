// src/pages/admin/FinanceProfit.tsx — the same screen Accounts uses.
import AdminLayout from '../../components/AdminLayout'
import ProfitBoard from '../../components/finance/ProfitBoard'

export default function AdminFinanceProfit() {
  return (
    <AdminLayout>
      <ProfitBoard />
    </AdminLayout>
  )
}
