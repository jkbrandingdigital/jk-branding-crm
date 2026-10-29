// "Me" page — wraps the shared MyLeave component.
// NOTE: if your sales version differs, copy pages/sales/MyLeave.tsx
// and just swap SalesLayout -> ReceptionLayout.
import ReceptionLayout from '../../components/ReceptionLayout'
import MyLeave from '../../components/leave/MyLeave'

export default function ReceptionMyLeave() {
  return (
    <ReceptionLayout active="my-leave">
      <MyLeave />
    </ReceptionLayout>
  )
}
