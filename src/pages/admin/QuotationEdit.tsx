import AdminLayout from '../../components/AdminLayout'
import QuotationForm from '../../components/quotations/QuotationForm'

export default function AdminQuotationEdit() {
  return (
    <AdminLayout>
      <QuotationForm basePath="/admin/quotations" />
    </AdminLayout>
  )
}