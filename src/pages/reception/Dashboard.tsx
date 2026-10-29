import ReceptionLayout from '../../components/ReceptionLayout'
import ReceptionBoard from '../../components/reception/ReceptionBoard'

export default function ReceptionDashboard() {
  return (
    <ReceptionLayout active="today">
      <h1 className="mb-1 text-xl font-bold">Today's Visitors</h1>
      <p className="mb-6 text-sm text-gray-500">Live visitor status</p>
      <ReceptionBoard />
    </ReceptionLayout>
  )
}
