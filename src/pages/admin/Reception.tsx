import AdminLayout from '../../components/AdminLayout'
import ReceptionBoard from '../../components/reception/ReceptionBoard'

export default function AdminReception() {
  return (
    <AdminLayout>
      <h1 className="mb-1 text-xl font-bold">Reception — Today's Visitors</h1>
      <p className="mb-6 text-sm text-gray-500">All branches · view only</p>
      <ReceptionBoard readOnly />
    </AdminLayout>
  )
}