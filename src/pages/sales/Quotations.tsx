import SalesLayout from '../../components/SalesLayout'
import QuotationList from '../../components/quotations/QuotationList'

export default function SalesQuotationList() {
  return (
    <SalesLayout active="quotations">
      <QuotationList basePath="/sales/quotations" />
    </SalesLayout>
  )
}