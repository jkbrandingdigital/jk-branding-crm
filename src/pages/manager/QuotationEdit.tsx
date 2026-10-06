import ManagerLayout from '../../components/ManagerLayout'
import QuotationForm from '../../components/quotations/QuotationForm'

export default function ManagerQuotationEdit() {
  return (
    <ManagerLayout>
      <QuotationForm basePath="/manager/quotations" />
    </ManagerLayout>
  )
}