import AdminLayout from '../../components/AdminLayout'
import QuotationList from '../../components/quotations/QuotationList'

export default function AdminQuotationList() {
  return (
    <AdminLayout>
      <QuotationList basePath="/admin/quotations" />
    </AdminLayout>
  )
}