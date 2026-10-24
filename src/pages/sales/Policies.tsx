import SalesLayout from '../../components/SalesLayout'
import MyPolicies from '../../components/policies/MyPolicies'

export default function SalesPolicies() {
  // SalesLayout routes by name, not path, so it has to be told which
  // item is the current one. 'policies' must match the key used in the
  // nav list inside SalesLayout.
  return (
    <SalesLayout active="policies">
      <MyPolicies />
    </SalesLayout>
  )
}