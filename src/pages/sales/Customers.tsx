import SalesLayout from '../../components/SalesLayout'
import CustomersBoard from '../../components/customers/CustomersBoard'

export default function SalesCustomers() {
  return (
    <SalesLayout active="customers">
      <CustomersBoard />
    </SalesLayout>
  )
}