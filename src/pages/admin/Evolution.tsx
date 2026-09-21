import AdminLayout from '../../components/AdminLayout'
import ReportsReview from '../../components/ReportsReview'

export default function AdminEvolution() {
  return (
    <AdminLayout>
      <ReportsReview initialTab="evolution" />
    </AdminLayout>
  )
}