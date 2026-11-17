import AccountsLayout from '../../components/AccountsLayout'
import QuotationPreview from '../../components/quotations/QuotationPreview'
import { usePermissions } from '../../lib/permissions'

export default function AccountsQuotationView() {
  const { can } = usePermissions()
  return (
    <AccountsLayout>
      <QuotationPreview basePath="/accounts/quotations" canEdit={can('quote_edit')} />
    </AccountsLayout>
  )
}
