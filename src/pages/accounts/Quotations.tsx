import AccountsLayout from '../../components/AccountsLayout'
import QuotationList from '../../components/quotations/QuotationList'

// The sidebar has offered Quotations to Accounts for a while, but there
// was no page behind it — the click fell through to Job Work. Same list
// everyone else uses; what Accounts may do on it is decided by its
// permissions (mod_quotations, quote_create, quote_edit, quote_delete).
export default function AccountsQuotations() {
  return (
    <AccountsLayout>
      <QuotationList basePath="/accounts/quotations" />
    </AccountsLayout>
  )
}
