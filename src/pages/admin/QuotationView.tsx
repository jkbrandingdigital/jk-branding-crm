import AdminLayout from '../../components/AdminLayout'
import QuotationPreview from '../../components/quotations/QuotationPreview'
import { usePermissions } from '../../lib/permissions'

export default function AdminQuotationView() {
  const { can } = usePermissions()
  return (
    <AdminLayout>
      <QuotationPreview basePath="/admin/quotations" canEdit={can('quote_edit')} />
    </AdminLayout>
  )
}