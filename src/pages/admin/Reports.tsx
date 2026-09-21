import AdminLayout from '../../components/AdminLayout'
import ReportsReview from '../../components/ReportsReview'

export default function AdminReports() {
  return (
    <AdminLayout>
      <ReportsReview initialTab="reports" />
    </AdminLayout>
  )
}