import ManagerLayout from '../../components/ManagerLayout'
import QuotationList from '../../components/quotations/QuotationList'

export default function ManagerQuotationList() {
  return (
    <ManagerLayout>
      <QuotationList basePath="/manager/quotations" />
    </ManagerLayout>
  )
}