import SalesLayout from '../../components/SalesLayout'
import QuotationForm from '../../components/quotations/QuotationForm'

export default function SalesQuotationEdit() {
  return (
    <SalesLayout active="quote-new">
      <QuotationForm basePath="/sales/quotations" />
    </SalesLayout>
  )
}