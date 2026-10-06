import SalesLayout from '../../components/SalesLayout'
import QuotationPreview from '../../components/quotations/QuotationPreview'
import { usePermissions } from '../../lib/permissions'

export default function SalesQuotationView() {
  const { can } = usePermissions()
  return (
    <SalesLayout active="quotations">
      <QuotationPreview basePath="/sales/quotations" canEdit={can('quote_edit')} />
    </SalesLayout>
  )
}