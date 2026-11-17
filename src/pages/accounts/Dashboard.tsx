import AccountsLayout from '../../components/AccountsLayout'
import FinanceDashboard from '../../components/finance/FinanceDashboard'

// The Accounts home page (/accounts).
export default function AccountsDashboard() {
  return (
    <AccountsLayout>
      <FinanceDashboard area="accounts" />
    </AccountsLayout>
  )
}
