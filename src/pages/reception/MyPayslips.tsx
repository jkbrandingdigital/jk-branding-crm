// "Me" page — wraps the shared MyPayslips component.
// NOTE: if your sales version differs, copy pages/sales/MyPayslips.tsx
// and just swap SalesLayout -> ReceptionLayout.
import ReceptionLayout from '../../components/ReceptionLayout'
import MyPayslips from '../../components/payroll/MyPayslips'

export default function ReceptionMyPayslips() {
  return (
    <ReceptionLayout active="my-payslips">
      <MyPayslips />
    </ReceptionLayout>
  )
}
