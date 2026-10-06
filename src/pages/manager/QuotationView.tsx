import ManagerLayout from '../../components/ManagerLayout'
import QuotationPreview from '../../components/quotations/QuotationPreview'
import { usePermissions } from '../../lib/permissions'

export default function ManagerQuotationView() {
  const { can } = usePermissions()
  return (
    <ManagerLayout>
      <QuotationPreview basePath="/manager/quotations" canEdit={can('quote_edit')} />
    </ManagerLayout>
  )
}