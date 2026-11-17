// src/pages/admin/FinancePayments.tsx — Route: /admin/finance/payments
import AdminLayout from '../../components/AdminLayout'
import PaymentsInbox from '../../components/finance/PaymentsInbox'

export default function AdminFinancePayments() {
  return (
    <AdminLayout>
      <PaymentsInbox />
    </AdminLayout>
  )
}
