import AccountsLayout from '../../components/AccountsLayout'
import QuotationForm from '../../components/quotations/QuotationForm'

export default function AccountsQuotationEdit() {
  return (
    <AccountsLayout>
      <QuotationForm basePath="/accounts/quotations" />
    </AccountsLayout>
  )
}
