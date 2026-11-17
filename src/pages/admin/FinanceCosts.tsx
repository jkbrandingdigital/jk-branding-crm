// src/pages/admin/FinanceCosts.tsx — the same screen Accounts uses.
import AdminLayout from '../../components/AdminLayout'
import CostsBoard from '../../components/finance/CostsBoard'

export default function AdminFinanceCosts() {
  return (
    <AdminLayout>
      <CostsBoard />
    </AdminLayout>
  )
}
