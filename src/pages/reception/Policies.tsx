// "Me" page — wraps the shared MyPolicies component (reading is open
// to everyone, so no Guard).
// NOTE: if your sales version differs, copy pages/sales/Policies.tsx
// and just swap SalesLayout -> ReceptionLayout.
import ReceptionLayout from '../../components/ReceptionLayout'
import MyPolicies from '../../components/policies/MyPolicies'

export default function ReceptionPolicies() {
  return (
    <ReceptionLayout active="policies">
      <MyPolicies />
    </ReceptionLayout>
  )
}
